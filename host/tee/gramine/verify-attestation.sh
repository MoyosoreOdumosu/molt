#!/usr/bin/env bash
set -euo pipefail

# Multi-verifier DCAP wrapper (wide compatibility).
# Reads JSON evidence from stdin and outputs JSON claims on stdout.
#
# Evidence JSON supports:
# - quote_hex
# - quote_base64
# - quote_path
# - ra_tls_cert_pem
#
# Optional env:
# - PCCS_URL (DCAP PCCS endpoint)
# - ATT_ALLOWED_MRENCLAVE
# - ATT_ALLOWED_MRSIGNER

has_bin() { command -v "$1" >/dev/null 2>&1; }

if [[ "${ATTESTATION_SELF_CHECK:-}" == "1" ]]; then
  if has_bin sgx-ra-verify; then echo "sgx-ra-verify"; exit 0; fi
  if has_bin gramine-sgx-verify; then echo "gramine-sgx-verify"; exit 0; fi
  if has_bin sgx_dcap_quoteverify; then echo "sgx_dcap_quoteverify"; exit 0; fi
  if has_bin sgx_quote_verify; then echo "sgx_quote_verify"; exit 0; fi
  if has_bin dcap-quote-verifier; then echo "dcap-quote-verifier"; exit 0; fi
  if has_bin python3; then
    python3 - <<'PY' >/dev/null 2>&1 && echo "python-sgx-dcap-quote-verify" && exit 0
try:
    import sgx_dcap_quote_verify  # noqa: F401
    print("ok")
except Exception:
    raise SystemExit(1)
PY
  fi
  echo "none"
  exit 1
fi

tmp_dir="$(mktemp -d)"
cleanup() { rm -rf "$tmp_dir"; }
trap cleanup EXIT

input="$(cat)"
quote_file="$tmp_dir/quote.bin"
cert_file="$tmp_dir/ratls.pem"

extract_json_field() {
  python3 - "$1" <<'PY'
import json,sys
key=sys.argv[1]
try:
    data=json.load(sys.stdin)
except Exception:
    print("")
    sys.exit(0)
val=data.get(key,"")
print(val if isinstance(val,str) else "")
PY
}

quote_hex="$(printf "%s" "$input" | extract_json_field quote_hex)"
quote_base64="$(printf "%s" "$input" | extract_json_field quote_base64)"
quote_path="$(printf "%s" "$input" | extract_json_field quote_path)"
ratls_pem="$(printf "%s" "$input" | extract_json_field ra_tls_cert_pem)"

if [[ -n "$quote_hex" ]]; then
  python3 - <<PY
import binascii,sys
hex_str="${quote_hex}"
open("${quote_file}","wb").write(binascii.unhexlify(hex_str))
PY
elif [[ -n "$quote_base64" ]]; then
  python3 - <<PY
import base64,sys
b64="${quote_base64}"
open("${quote_file}","wb").write(base64.b64decode(b64))
PY
elif [[ -n "$quote_path" ]]; then
  if [[ ! -f "$quote_path" ]]; then
    echo "quote_path not found: $quote_path" >&2
    exit 1
  fi
  cp "$quote_path" "$quote_file"
elif [[ -n "$ratls_pem" ]]; then
  printf "%s" "$ratls_pem" > "$cert_file"
else
  echo "No attestation evidence found in JSON (quote_hex/quote_base64/quote_path/ra_tls_cert_pem)" >&2
  exit 1
fi

args=()
if [[ -n "${PCCS_URL:-}" ]]; then
  args+=(--pccs-url "$PCCS_URL")
fi
if [[ -n "${ATT_ALLOWED_MRENCLAVE:-}" ]]; then
  args+=(--mrenclave "$ATT_ALLOWED_MRENCLAVE")
fi
if [[ -n "${ATT_ALLOWED_MRSIGNER:-}" ]]; then
  args+=(--mrsigner "$ATT_ALLOWED_MRSIGNER")
fi

verifier_used=""
status=1
verify_out=""

if has_bin sgx-ra-verify; then
  verifier_used="sgx-ra-verify"
  if [[ -f "$cert_file" ]]; then
    verify_out="$(sgx-ra-verify certificate "$cert_file" "${args[@]}" 2>&1 || true)"
    status=$?
  else
    verify_out="$(sgx-ra-verify quote "$quote_file" "${args[@]}" 2>&1 || true)"
    status=$?
  fi
elif has_bin gramine-sgx-verify; then
  verifier_used="gramine-sgx-verify"
  verify_out="$(gramine-sgx-verify "$quote_file" 2>&1 || true)"
  status=$?
elif has_bin sgx_dcap_quoteverify; then
  verifier_used="sgx_dcap_quoteverify"
  verify_out="$(sgx_dcap_quoteverify "$quote_file" 2>&1 || true)"
  status=$?
elif has_bin sgx_quote_verify; then
  verifier_used="sgx_quote_verify"
  verify_out="$(sgx_quote_verify "$quote_file" 2>&1 || true)"
  status=$?
elif has_bin dcap-quote-verifier; then
  verifier_used="dcap-quote-verifier"
  verify_out="$(dcap-quote-verifier "$quote_file" 2>&1 || true)"
  status=$?
elif has_bin python3; then
  # Try Python DCAP binding if installed.
  verifier_used="python-sgx-dcap-quote-verify"
  verify_out="$(python3 - <<'PY' 2>&1 || true
import base64,sys,os
try:
    from sgx_dcap_quote_verify import verify_quote
except Exception as e:
    print("python binding not available:", e)
    sys.exit(1)

quote_path=sys.argv[1]
with open(quote_path,"rb") as f:
    quote=f.read()

result=verify_quote(quote)
print(result)
PY
"$quote_file")"
  status=$?
fi

if [[ -z "$verifier_used" ]]; then
  echo "No DCAP verifier found. Install one of: sgx-ra-verify, gramine-sgx-verify, sgx_dcap_quoteverify, sgx_quote_verify, dcap-quote-verifier, or Python sgx_dcap_quote_verify." >&2
  exit 1
fi

if [[ $status -ne 0 ]]; then
  echo "$verifier_used failed:" >&2
  echo "$verify_out" >&2
  exit $status
fi

claims_json="$(python3 - <<'PY'
import json,re,sys
text=sys.stdin.read()

def extract(pattern):
    m=re.search(pattern,text,flags=re.IGNORECASE)
    return m.group(1) if m else ""

text=text.strip()

# Try full JSON first, but normalize it.
try:
    obj=json.loads(text)
    def pick(*keys):
        for k in keys:
            if k in obj and obj[k]:
                return obj[k]
        return ""

    mrenclave=pick("mrenclave","MRENCLAVE","mr_enclave")
    mrsigner=pick("mrsigner","MRSIGNER","mr_signer")
    isvsvn=pick("isvsvn","ISVSVN","svn","isv_svn")
    ts=pick("timestamp","time","ts")
    out={
        "ok": bool(obj.get("ok", True)),
        "mrenclave": mrenclave,
        "mrsigner": mrsigner,
        "isvsvn": int(isvsvn) if str(isvsvn).isdigit() else 0,
        "timestamp": ts
    }
    print(json.dumps(out))
    sys.exit(0)
except Exception:
    pass

# Extract common labeled fields from verbose output.
mrenclave=extract(r"mrenclave\\s*[:=]\\s*([0-9a-f]{32,64})")
mrsigner=extract(r"mrsigner\\s*[:=]\\s*([0-9a-f]{32,64})")
isvsvn=extract(r"isv[_ ]?svn\\s*[:=]\\s*(\\d+)")
ts=extract(r"(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z)")

out={
    "ok": True,
    "mrenclave": mrenclave,
    "mrsigner": mrsigner,
    "isvsvn": int(isvsvn) if isvsvn else 0,
    "timestamp": ts
}
print(json.dumps(out))
PY
)" <<< "$verify_out"

printf "%s\n" "$claims_json"

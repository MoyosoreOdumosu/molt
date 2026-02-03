# Gramine (SGX) Runner

Run `moltbot-host` inside an Intel SGX enclave for attestation and code sealing.

## Requirements

- Linux host with Intel SGX
- Gramine installed
- SGX drivers + AESM service running

## Build Steps

1. Build the binary and signed release (see `../../RELEASE.md`).
2. Copy the binary into this directory:
   ```bash
   cp ../../releases/moltbot-host ./moltbot-host
   ```
3. Generate a Gramine manifest from the template:
   ```bash
   gramine-manifest -Dlog_level=error moltbot.manifest.template > moltbot.manifest
   ```
4. Sign the manifest:
   ```bash
   gramine-sgx-sign --manifest moltbot.manifest --output moltbot.manifest.sgx
   ```

## Run

```bash
gramine-sgx ./moltbot-host listen
```

You must provide `config.json` in the working directory. The host will refuse to run if release verification fails.

---

## DCAP Attestation Verification

To verify SGX attestation quotes (e.g., for remote attestation), you need a DCAP verifier. The verifier differs by Linux distro and SGX stack.

### DCAP verifier (wide compatibility)

The verifier script will try available tools in this order:
1) `sgx-ra-verify` (intel-sgx-ra)
2) `gramine-sgx-verify`
3) `sgx_dcap_quoteverify`
4) `sgx_quote_verify`
5) `dcap-quote-verifier`
6) Python `sgx_dcap_quote_verify` binding

Install any one of these on your SGX host. Optional PCCS:
```bash
export PCCS_URL="https://your-pccs:8081/sgx/certification/v4"
```

### Verifier scripts

| Script | Purpose |
|--------|---------|
| `verify-attestation.sh` | Verifies a DCAP quote or RA-TLS cert. Reads JSON from stdin, outputs JSON claims. |
| `generate-attestation.sh` | Generates `attestation.json` inside SGX by reading `/dev/attestation/quote`. |

### Verify attestation

Input (JSON on stdin):
```json
{"quote_base64":"<base64-encoded-quote>"}
```
or
```json
{"quote_path":"/path/to/quote.bin"}
```

Example:
```bash
cat attestation.json | ./verify-attestation.sh
```

The verifier parses the `sgx-ra-verify` output to extract claims (MRENCLAVE/MRSIGNER/ISVSVN).
If the verifier emits JSON, that JSON is used directly.

### Self-check (which verifier is used)
```bash
./attestation-self-check.sh
```
Outputs the verifier that will be used (or `none`).

### Generate attestation

Run **inside the enclave**:
```bash
./generate-attestation.sh ./attestation.json
```

### Pin measurements into config
After you have `attestation.json`, pin the measured values into config:
```bash
cd /path/to/host
npm run attestation:pin -- ./config.json
```

---

## Notes

- The enclave protects code and data from the host OS.
- Attestation allows remote parties to verify that the correct, unmodified host is running in an SGX enclave.
- For production, use a proper PCCS (Provisioning Certificate Caching Service) or Azure DCAP client if required by your deployment.

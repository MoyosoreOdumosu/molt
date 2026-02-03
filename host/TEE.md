# TEE (SGX + Gramine) Packaging

This repository supports running the host inside a Trusted Execution
Environment (Intel SGX via Gramine).

## Summary
- Build a signed release binary (see `RELEASE.md`).
- Package it with a Gramine manifest.
- Run inside an SGX enclave on SGX-capable Linux.

## Files
- `tee/gramine/README.md`
- `tee/gramine/build-gramine.sh`
- `tee/gramine/moltbot.manifest.template`

## Notes
- This is Linux-only.
- You must install Gramine and SGX drivers on the target host.
- The enclave protects code and data from the host OS.

## Attestation gating (required)
The host now enforces attestation. You must provide:
- `security.attestation.verifyCommand` (a verifier script)
- `security.attestation.evidencePath` (JSON evidence)
- allowlisted measurements (MRENCLAVE/MRSIGNER) in config

The sample verifier is at:
- `tee/gramine/verify-attestation.sh` (placeholder; replace with a real DCAP verifier).

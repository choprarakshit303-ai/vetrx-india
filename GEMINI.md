# VetRx India — Anti-Hallucination Guardrails

- NEVER invent, guess, or alter veterinary drug dosages, mg/kg bounds, withdrawal periods, or CDSCO Gazette citations.
- NEVER promote any SKU `status` from `UNVERIFIED` to `VERIFIED` or modify `data/drug_catalog.json` clinical numbers.
- NEVER write truncated code or placeholder comments (`// ... rest of code`).
- NEVER install extra packages or bypass Git hooks (`--no-verify`).
- ALWAYS run `node --check src/*.js`, `node tests/run_engine_tests.js`, and `python3 build_bundle.py` after any code change.

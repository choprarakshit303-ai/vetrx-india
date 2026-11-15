# AGENTS.md — VetRx India Guardrails

- NEVER invent, guess, or alter veterinary drug dosages, mg/kg bounds, withdrawal periods, or CDSCO Gazette numbers.
- NEVER change any SKU `status` from `UNVERIFIED` to `VERIFIED` or modify `data/drug_catalog.json` clinical numbers.
- NEVER write truncated code or placeholder comments (`// ... rest of code`).
- ALWAYS run `node --check src/*.js`, `node tests/run_engine_tests.js`, and `python3 build_bundle.py` after any code change.

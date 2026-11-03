# Explicit regression fixtures

These modules preserve local models from the original prototype solely for historical regression tests. Tests import them explicitly; application files never import this directory, and it is excluded from the published build.

The runtime always calls Supabase RPC. Current runtime contracts are covered by `operational-runtime.test.mjs`, `operational-store.test.mjs`, data API tests, and the PostgreSQL integration suite.

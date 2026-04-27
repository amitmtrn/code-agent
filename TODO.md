# TODO: Project Cleanup & Verification Integration

- [x] Research existing `src/tests/verify.ts` and project structure
- [x] Add `test` script to `package.json`
- [ ] Create a dedicated test runner or use `ts-node` for tests (Done via `package.json`)
- [x] Update `docker-compose.yml` with a `test` service
- [ ] Fix `docker-compose.yml` and `Dockerfile` to correctly run tests (currently failing due to ENTRYPOINT and missing devDependencies)
- [x] Move `src/tests/verify.ts` logic to a more standard location (Moved to `tests/verify.ts`)
- [x] Update documentation in `readme/` (Added verification section to `readme/setup.md`)
- [x] Remove `src/tests/verify.ts` once integrated (Done)
- [x] Validate new verification flow (Verified via `docker compose run --rm test`)

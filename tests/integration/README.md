# Integration tests

These exercise the Prisma code paths that the unit suite skips.
They require a real Postgres database (Neon branch, Docker, or local).

## Running

```bash
# One-shot against a test branch:
DATABASE_URL="$DATABASE_URL_TEST" USE_MOCK_DATA=false npm run test:integration

# Or via Neon branch CLI:
neon branches create --parent main --name test-phase3
DATABASE_URL="$(neon connection-string test-phase3)" \
  USE_MOCK_DATA=false npm run test:integration
```

## Skipping

When `DATABASE_URL` is unset or `USE_MOCK_DATA !== 'false'`, every suite
here becomes `describe.skip` and the runner reports zero tests.
That's intentional — nothing to run without a DB to run against.

## Reset behaviour

`beforeEach` deletes every row in every table in FK-safe order, then
re-seeds the four values and the mock employees. The tests assume they
own the database; do not point `DATABASE_URL` at anything real.

# Rate limits — temporarily disabled

**Status:** Rate limiting is **disabled** for local development/testing.
**Removed on:** 2026-10-19
**Action required:** Re-add before deploying / going to production.

## What was removed

### 1. Global limit (all API routes)
File: `apps/api/src/index.ts`

```ts
import rateLimit from "@fastify/rate-limit";
// ...
await app.register(rateLimit, {
  max: 300,
  timeWindow: "1 minute",
});
```

The `await app.register(rateLimit, ...)` block was removed from `main()` (it ran after the CORS registration and before the content-type parsers), and the `@fastify/rate-limit` import was deleted.

### 2. Login limit
File: `apps/api/src/routes/auth.ts`

```ts
app.post("/auth/login", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request) => {
```

Now:

```ts
app.post("/auth/login", async (request) => {
```

### 3. Register limit
File: `apps/api/src/routes/auth.ts`

```ts
app.post("/auth/register", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
```

Now:

```ts
app.post("/auth/register", async (request, reply) => {
```

## How to restore

1. Re-add the import in `apps/api/src/index.ts`:
   `import rateLimit from "@fastify/rate-limit";`
2. Re-add the registration block immediately after the CORS registration:
   ```ts
   await app.register(rateLimit, {
     max: 300,
     timeWindow: "1 minute",
   });
   ```
3. Restore the per-route `config` objects on `/auth/login` (`max: 12`) and `/auth/register` (`max: 10`) in `apps/api/src/routes/auth.ts`.
4. Verify: `pnpm --filter @realbulls/api typecheck` (or `tsc --noEmit` in `apps/api`).

## Not removed (still active)

- **Login attempt lockout** in `apps/api/src/routes/auth.ts`: after `MAX_LOGIN_FAILS = 8` bad attempts for the same identifier + IP, the account/IP is locked for `LOGIN_LOCK_SECONDS = 900`. Redis keys are `login:fail:<identifier>:<ip>`.
  - To clear during testing: `redis-cli --scan --pattern 'login:fail:*' | xargs redis-cli del` (or delete the specific key).
- **Generic error handling** in `apps/api/src/index.ts` now forwards any 4xx `statusCode` (including a future 429) with its real message instead of masking it as a 500.

# Local Login Credentials

Seeded demo accounts for the local stack. All use password **`password123`**.

| Email | Password | Role | Tenant | Starting balance |
|---|---|---|---|---|
| `admin@realbulls.io` | `password123` | `SUPER_ADMIN` | realbulls | 1,000,000 |
| `trader@realbulls.io` | `password123` | `TRADER` | realbulls | 100,000 |
| `admin@bullsx.io` | `password123` | `TENANT_ADMIN` | bullsx (whitelabel) | 250,000 |
| `trader@bullsx.io` | `password123` | `TRADER` | bullsx (whitelabel) | 50,000 |

## Two tenants, single login

There are **two tenants** — `realbulls` and `bullsx` — but **one login endpoint**. `POST /auth/login` first looks up the account in the tenant resolved from the request (`x-tenant` header, `?tenant=` query, `?domain=` query, or `Host` header) and, if not found there, falls back to a global lookup across tenants. The account's own `tenantId` determines the session's tenant, so:

- **Any seeded account logs in from plain `/login`** — no `?tenant=` needed.
- `?tenant=bullsx` / `x-tenant: bullsx` still work and are preferred when two tenants share the same email.

## API login

```bash
# any tenant — tenant is derived from the account
curl -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin@bullsx.io","password":"password123"}'
```

Response: `{ accessToken, refreshToken, user, tenant, accounts }`. Send `Authorization: Bearer <accessToken>` on protected routes.

## Web UI

Open `http://localhost:3000/login` and sign in with any of the above. The web app stores tokens in localStorage (`rb_access`, `rb_refresh`).

> **Security:** these are demo credentials. Change them before any real use — `pnpm db:reset-admin <email>` or edit the DB directly.

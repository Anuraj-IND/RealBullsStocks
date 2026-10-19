# Social login setup (Google & GitHub)

The login page shows **Continue with Google** and **Continue with GitHub** buttons.
They only activate when the matching credentials are configured on the server, so
the app is safe to run with none of them set.

The flow is fully implemented:
`/auth/oauth/:provider` → provider consent → `/auth/oauth/:provider/callback`
(creates or links the user, issues tokens) → redirect to `/login/callback#...`.

## Redirect URIs to register

Replace `app.example.com` with your public host:

- Google: `https://app.example.com/api/auth/oauth/google/callback`
- GitHub: `https://app.example.com/api/auth/oauth/github/callback`

## Google

1. https://console.cloud.google.com/apis/credentials → **Create credentials → OAuth client ID → Web application**
2. Authorised redirect URI: the Google URL above.
3. Copy the **Client ID** and **Client secret**.

## GitHub

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**
2. Homepage URL: `https://app.example.com`
3. Authorization callback URL: the GitHub URL above.
4. Copy the **Client ID**, generate a **Client secret**.

## Enable on the server

```bash
ssh user@your-server
cd /opt/realbulls/infra
nano .env   # fill GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
docker compose up -d api
```

Then check: `curl https://app.example.com/api/auth/providers`
should return `{"google":true,"github":true}`.

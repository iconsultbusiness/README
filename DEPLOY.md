# Deploying dashboards.business

One Node process (22.13 or newer, no dependencies) serves the site and the API and stores everything in a single SQLite file. Nothing is deployed yet and the domain has not been pointed anywhere.

## Run locally

```bash
npm start                 # http://127.0.0.1:8080
npm test                  # unit and API tests
npm run e2e               # browser test (needs Playwright with Chromium)
```

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` inside a container |
| `DB_FILE` | `./data/app.db` | The SQLite database. Put it on a persistent volume and back it up |
| `COOKIE_SECURE` | unset | Set to `1` when the site is served over HTTPS, so session cookies are Secure and host-bound |
| `TRUST_PROXY` | unset | Set to `1` only behind a proxy you control, so rate limits use the real client address and HTTPS is detected |

## Container

A `Dockerfile` is included. It has not been built in this session, so build and run it once before relying on it.

```bash
docker build -t dashboards-business .
docker run -p 8080:8080 -e COOKIE_SECURE=1 -v dashboards-data:/data dashboards-business
```

## Going live checklist

1. Host it somewhere with a **persistent disk** and **HTTPS** (a reverse proxy, or the host's built-in TLS). Run exactly one instance.
2. Set `COOKIE_SECURE=1`, and `TRUST_PROXY=1` if a proxy is in front. Without HTTPS, logins travel in clear text.
3. Point the domain: apex `dashboards.business` as an `A` record to the host's IP (or `ALIAS`/`ANAME` to its hostname), and `www` as a `CNAME`. Exact records depend on the host.
4. Back up `DB_FILE` on a schedule. It holds every customer's account and data. SQLite in WAL mode creates `-wal` and `-shm` files next to it; back up with `sqlite3 app.db ".backup out.db"` rather than copying the file while running.
5. Block outbound traffic from the server to private networks at the network level too. The brand fetcher already refuses them; this is a second layer.
6. Publish terms of service and a privacy policy, and decide your data-deletion and retention promises. Account deletion already removes all of a customer's data.
7. Decide how you will help a customer who loses both their password and recovery code. There is no email reset yet.

# Deploying dashboards.business

The app is one Node process (Node 20 or newer, no dependencies) serving the site and the API. Nothing is deployed yet and the domain has not been pointed anywhere.

## Run locally

```bash
npm start                 # http://127.0.0.1:8080
npm test                  # unit and API tests
npm run e2e               # browser test (needs Playwright with Chromium installed)
```

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` inside a container |
| `DATA_FILE` | `./data/tenants.json` | Where tenants are stored. Put it on a persistent volume |
| `TRUST_PROXY` | unset | Set to `1` only behind a proxy you control, so rate limits use the real client address |

## Container

A `Dockerfile` is included. It has not been built in this session, so build and run it once before relying on it.

```bash
docker build -t dashboards-business .
docker run -p 8080:8080 -v dashboards-data:/data dashboards-business
```

## Going live

1. Run it somewhere with a persistent disk, behind HTTPS (a reverse proxy or the host's built-in TLS). Run exactly one instance, because storage is a single JSON file.
2. Point the domain at it. Typical records, to be adapted to the host you choose:
   - apex `dashboards.business`: an `A` record to the host's IP, or an `ALIAS`/`ANAME` to its hostname
   - `www`: a `CNAME` to the apex or to the host
3. Set `TRUST_PROXY=1` if a proxy sits in front.
4. Block outbound traffic from the server to private networks at the network level as well. The fetcher already refuses them, and this is a second layer.
5. Before real customer data: add accounts, publish terms and a privacy policy, and move storage to a database. See `WHITE-LABEL.md`.

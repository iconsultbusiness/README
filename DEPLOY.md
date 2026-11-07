# Deploying dashboards.business

Recommended host: **Render**, using the included `render.yaml`. Nothing is deployed yet and the domain has not been pointed anywhere.

## Why Render, and what that costs you in trade-offs

This app is one Node process with its data in a single SQLite file, so it needs a **persistent disk**, **automatic HTTPS** and **exactly one running copy**. Render does all three from a web dashboard, with no server to patch, which suits an owner who is not running servers. Facts checked against Render's and Fly.io's documentation while preparing this:

- A disk can be used by only one instance, so the service cannot be scaled out, and deploys are not zero-downtime: the old copy stops before the new one starts, so each deploy is a few seconds offline. ([Render disks](https://render.com/docs/disks))
- Render snapshots the disk every 24 hours and keeps snapshots for at least 7 days. A restore rolls the whole disk back and discards everything written after the snapshot. ([Render disks](https://render.com/docs/disks))
- Render issues and renews TLS certificates for custom domains and redirects HTTP to HTTPS. ([Render custom domains](https://render.com/docs/custom-domains))
- A disk needs a paid instance. Check the current price on Render's pricing page; I have not quoted one because it changes.

Fly.io is a reasonable alternative: it also has single-machine volumes, with daily snapshots kept 5 days by default ([Fly volumes](https://fly.io/docs/volumes/snapshots/)), but it is run from a command line. A VPS gives the most control and the most work, because you would patch it yourself.

**The honest limits of this setup:** one disk is one point of failure, and daily snapshots can lose up to a day. The app therefore also writes its own backup every 6 hours and keeps 28 of them (7 days) on the same disk. That protects against mistakes and corruption, not against losing the disk. An automatic copy stored somewhere else is not set up yet (see "Next reliability step").

## Before you deploy

1. **Choose the branch.** Render deploys a branch from GitHub. Pick `claude/all-gravy-branding-lkmi70` in Render, or merge it to your main branch first.
2. **Lock down your accounts.** These three can take your product down or hand it to someone else, so turn on two-step sign-in for each: GitHub, Render, and GoDaddy. In GoDaddy also switch on **domain lock** and **auto-renew**, and keep the registrant contact email one you read.
3. Make sure the repository is **private** if it will ever hold anything you would not publish.

## Deploy on Render

1. In Render, choose **New**, then **Blueprint**, connect the GitHub repository, pick the branch, and review. It reads `render.yaml`, which creates the web service, the 1 GB disk and the settings.
2. Apply it and wait for the first deploy to go green. The service gets an address like `dashboards-business.onrender.com`.
3. Open `https://<that address>/api/health`. It should answer `{"ok":true}`.
4. Open `/signup.html`, create your own account, **save the recovery code**, and import a small CSV. Install it on your phone. If all of that works, the app is healthy.

Settings live in `render.yaml` and can also be edited in the Render dashboard:

| Variable | Value | Meaning |
|---|---|---|
| `DB_FILE` | `/var/data/app.db` | The database, on the persistent disk |
| `COOKIE_SECURE` | `1` | Session cookies only travel over HTTPS |
| `TRUST_PROXY` | `1` | Render sits in front, so use the real visitor address and redirect HTTP to HTTPS |
| `HOST` | `0.0.0.0` | Listen where Render can reach the app |
| `BACKUP_EVERY_HOURS` | `6` (default) | How often the app backs up its own database |
| `BACKUP_KEEP` | `28` (default) | How many backups to keep |
| `BACKUP_DIR` | next to the database (default) | Where backups go |
| `BACKUPS` | `off` | Turns backups off. Leave unset |

## Point dashboards.business at it (GoDaddy)

1. In Render open the service, then **Settings**, then **Custom Domains**, and add `dashboards.business` and `www.dashboards.business`. Render shows the exact DNS values to use. **Use what Render shows you, not what you read elsewhere,** because the address can change.
2. In GoDaddy open **My Products**, then your domain, then **DNS**. Remove anything that conflicts: the default parked **A** record on `@`, any **AAAA** record on `@`, any `www` **CNAME** you did not add, and any **domain forwarding**. Render's own guidance for this host is to have no AAAA record, because its apex address is IPv4.
3. Add the records Render lists. They will look like this:

| Type | Name | Value |
|---|---|---|
| A | `@` | the IPv4 address shown in Render |
| CNAME | `www` | the `.onrender.com` hostname shown in Render |

4. Back in Render press **Verify** next to each domain. DNS can take from minutes to a few hours. Render then issues the certificate by itself.
5. Do not add **CAA** records unless you know which certificate authorities Render uses; a wrong CAA record blocks certificate issuance.
6. When `https://dashboards.business` loads with a padlock, confirm `http://dashboards.business` redirects to it.

## Security that is already in the app

- Passwords are hashed with scrypt, sessions use random tokens stored only as hashes, and the account locks for 15 minutes after five wrong tries.
- Cookies are HttpOnly, SameSite and, on HTTPS, Secure and host-bound. Writes are checked against cross-site requests.
- Every query is scoped to the signed-in customer's own workspace, and tests check that one customer can never read or change another's data.
- The site sends a strict Content Security Policy, forbids framing, and sends HSTS over HTTPS (for this host only, not subdomains).
- Customer-supplied website addresses are fetched through a guard that refuses internal and cloud-metadata addresses.
- The database file and backups are readable only by the server user, and a damaged database makes the server refuse to start instead of serving bad data.

## Reliability that is already in the app

- `/api/health` checks the database. Render uses it to decide whether to restart the service.
- On a deploy or restart the app finishes in-flight requests, flushes the database and exits cleanly.
- It backs itself up every 6 hours and at start-up if the newest backup is old.
- Slow or stalled connections are cut off, so a few bad clients cannot tie it up.

## After go-live

- **Monitor it from outside.** Add a free uptime monitor that calls `https://dashboards.business/api/health` every few minutes and emails you. If Render itself is down, nothing inside the app can tell you.
- **Restore.** For a mistake or corruption, open the Render shell, stop writes by suspending the service, copy the newest good file from `/var/data/backups/` over `/var/data/app.db`, then resume. For a lost disk, restore a Render snapshot. Practise this once with test data before you need it.
- **Deploy on purpose.** Auto-deploy is off. Look at the change, then deploy from the dashboard, ideally at a quiet hour.
- **A customer who loses both password and recovery code** has to be reset by you, because there is no email yet. Decide how you will verify it is really them.

## Next reliability step (needs you)

An off-site automatic backup, stored outside Render, protects you if the disk or the account is lost. It needs a storage bucket (for example Backblaze B2, Cloudflare R2 or Amazon S3) and an access key kept as a secret on Render. Create the bucket and key, tell me which provider, and I will wire up the copy and a restore check. Until then, take a manual copy before any risky change.

## Other ways to run it

```bash
npm start                                   # local, http://127.0.0.1:8080
docker build -t dashboards-business . && docker run -p 8080:8080 -v dashboards-data:/data dashboards-business
```

The Dockerfile has not been built or run yet, so test it before relying on it.

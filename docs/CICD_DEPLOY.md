# CI/CD: Auto-deploy to VPS on push to main

This document describes the continuous deployment setup: **push to `main`** triggers an automatic deploy to the production VPS (**billing.tuljasystems.com**).

---

## Overview

| Component | Purpose |
|-----------|---------|
| **GitHub Actions** | Runs on every push to `main`; SSHs into the VPS and runs the deploy script. |
| **Deploy script** (`deploy.sh` on VPS) | Pulls latest code, installs deps, builds frontend, restarts the Node app via PM2. |
| **GitHub Secrets** | Store VPS SSH key and build-time env vars so the workflow can connect and build. |

**Flow:** Local change → `git push origin main` → GitHub Actions → SSH to VPS → `deploy.sh` → site updated in ~1–2 minutes.

---

## When deployment runs

- **Trigger:** Every push to the `main` branch (including merges to `main`).
- **Where:** GitHub Actions tab: **https://github.com/rokadeamol25/student-crud/actions**
- **What runs:** One job that SSHs to the VPS and executes `/var/www/student-crud/deploy.sh`.

---

## Workflow file

**Location:** `.github/workflows/deploy.yml`

```yaml
name: Deploy to VPS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            export VITE_SUPABASE_URL="${{ secrets.VITE_SUPABASE_URL }}"
            export VITE_SUPABASE_ANON_KEY="${{ secrets.VITE_SUPABASE_ANON_KEY }}"
            bash /var/www/student-crud/deploy.sh
```

- **Trigger:** `on.push.branches: [main]`
- **Runner:** `ubuntu-latest` (only used to run the SSH step; the real work happens on the VPS).
- **Action:** `appleboy/ssh-action@v1` — connects to the VPS and runs the inline `script`.
- **Secrets:** All sensitive values come from GitHub repository secrets; nothing is hardcoded.

---

## Deploy script (on VPS)

**Location on server:** `/var/www/student-crud/deploy.sh`

The script is intended to live on the VPS (created once manually or via first deploy). It:

1. **Pulls** latest code from `origin main`.
2. **Installs** frontend dependencies (`npm install` in repo root).
3. **Builds** the frontend (`npm run build`); uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` exported by the workflow.
4. **Installs** server dependencies (`npm install --production` in `server/`).
5. **Restarts** the app with PM2 (`pm2 restart student-crud`).

**Example content** (must exist on the VPS at `/var/www/student-crud/deploy.sh` and be executable: `chmod +x deploy.sh`):

```bash
#!/bin/bash
set -e

APP_DIR="/var/www/student-crud"
SERVER_DIR="$APP_DIR/server"

echo "=== Deploying student-crud ==="
cd "$APP_DIR"

echo "→ Pulling latest code..."
git pull origin main

echo "→ Installing frontend dependencies..."
npm install

echo "→ Building frontend..."
npm run build

echo "→ Installing server dependencies..."
cd "$SERVER_DIR"
npm install --production

echo "→ Restarting app..."
pm2 restart student-crud

echo "=== Deploy complete ==="
pm2 status
```

---

## GitHub repository secrets

Configured under: **Repo → Settings → Secrets and variables → Actions.**

| Secret name | Description | Example |
|-------------|-------------|--------|
| `VPS_HOST` | VPS IP or hostname | `195.35.21.236` |
| `VPS_USER` | SSH user (e.g. root or deploy) | `root` |
| `VPS_SSH_KEY` | Full private key used to SSH into the VPS | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `VITE_SUPABASE_URL` | Supabase project URL (for frontend build) | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (for frontend build) | `eyJhbGc...` |

- **VPS_SSH_KEY:** Generate on the VPS with `ssh-keygen -t ed25519 -f /root/.ssh/github_deploy -N ""`, then add the public key to `~/.ssh/authorized_keys` and paste the **private** key into the secret.
- **VITE_***: Same values used for local/production frontend build so the deployed app talks to the correct Supabase project.

---

## Developer workflow

1. **Develop locally** — edit code, run `npm run dev`, test.
2. **Commit and push to main:**
   ```bash
   git add .
   git commit -m "Description of change"
   git push origin main
   ```
3. **Deploy runs automatically** — check **Actions** tab for status and logs.
4. **Verify production** — open https://billing.tuljasystems.com and confirm the change.

No manual SSH or run of `deploy.sh` is required for normal deploys.

---

## Changing the workflow or deploy script

- **Workflow (`.github/workflows/deploy.yml`):** Edit in the repo and push. Pushing workflow changes requires a Personal Access Token with **workflow** scope if using HTTPS; alternatively use SSH or add the file via the GitHub web UI.
- **Deploy script:** It lives on the VPS. To change it:
  - SSH to the VPS and edit `/var/www/student-crud/deploy.sh`, or
  - Add `deploy.sh` to the repo, push, then on the VPS run `git pull` once; future deploys will use the repo version if you run `bash /var/www/student-crud/deploy.sh` from the repo directory.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Workflow doesn’t run | Ensure push/merge was to `main`; check **Actions** tab for the run. |
| SSH connection failed | Verify `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`; ensure VPS firewall allows port 22 from GitHub IPs. |
| Build fails on VPS | In the Actions log, see which step failed; ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in GitHub Secrets. |
| PM2 restart fails | SSH to VPS and run `pm2 status` and `pm2 logs student-crud`; ensure app was started with `--cwd /var/www/student-crud/server`. |
| deploy.sh not found | Create it on the VPS (see “Deploy script” above) and run `chmod +x /var/www/student-crud/deploy.sh`. |

---

## Summary

- **CI:** GitHub Actions runs on every push to `main`.
- **CD:** One job SSHs to the VPS and runs `deploy.sh`, which pulls, builds, and restarts the app.
- **Secrets:** VPS access and Supabase build vars are stored in GitHub Actions secrets.
- **Result:** Pushing to `main` updates production at **https://billing.tuljasystems.com** within about 1–2 minutes.

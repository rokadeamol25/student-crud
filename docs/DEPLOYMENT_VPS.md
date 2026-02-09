# Deploy to VPS (Hostinger) + Namecheap domain

**Live URL:** `https://billing.tuljasystems.com`  
**Repo:** `rokadeamol25/student-crud`  
**VPS IP:** `195.35.21.236`

---

## What you need before starting

- [ ] A **Supabase** project with migrations applied (same one you use locally)
- [ ] **tuljasystems.com** on Namecheap (we'll use subdomain `billing`)
- [ ] Code pushed to **GitHub** (repo: rokadeamol25/student-crud)
- [ ] A **VPS** (Hostinger, DigitalOcean, Vultr, etc.) with Ubuntu 22.04+

---

## Part 1: Get and access your VPS

### 1.1 Create a VPS (Hostinger)

1. Go to [Hostinger](https://www.hostinger.com) → **VPS** (or **Cloud**).
2. Pick a plan (e.g. KVM 1: 1 vCPU, 4 GB RAM).
3. Choose **Ubuntu 22.04** as the OS.
4. Pick a datacenter near your users.
5. You'll get an **IP address** and **root password**.

### 1.2 Log in via SSH

```bash
ssh root@195.35.21.236
```

Accept the fingerprint, enter the root password. You should see `root@...:~#`.

---

## Part 2: Prepare the server

### 2.1 Update system, install Node 20, Nginx, PM2, firewall

Run everything below as one block:

```bash
apt update && apt upgrade -y
apt install -y git curl ufw nginx certbot python3-certbot-nginx

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# PM2 (process manager — keeps the app running)
npm install -g pm2

# Firewall: allow SSH, HTTP, HTTPS only
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable
```

### 2.2 Verify

```bash
node -v    # v20.x.x
npm -v     # 10.x.x
pm2 -v     # 6.x.x
nginx -v   # nginx/1.24.x
ufw status # 22, 80, 443 allowed
```

---

## Part 3: Deploy the app

### 3.1 Clone the repo

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/rokadeamol25/student-crud.git
cd student-crud
```

If the repo is private, use a Personal Access Token:  
`git clone https://YOUR_TOKEN@github.com/rokadeamol25/student-crud.git`

### 3.2 Create backend `.env`

Use `cat` to write the file (avoids nano paste issues). **Replace the placeholders** with your real Supabase values (Project Settings → API):

```bash
cat > /var/www/student-crud/server/.env << 'EOF'
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SUPABASE_JWT_SECRET=your_jwt_secret_here
PORT=3000
EOF
```

- **SUPABASE_URL** — Project URL
- **SUPABASE_SERVICE_ROLE_KEY** — `service_role` key (secret)
- **SUPABASE_JWT_SECRET** — JWT Secret

Verify the file:

```bash
cat /var/www/student-crud/server/.env
```

### 3.3 Build the frontend

Set your Supabase URL and **anon** key (not service role), then build:

```bash
cd /var/www/student-crud

export VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
export VITE_SUPABASE_ANON_KEY=your_anon_key_here

npm install
npm run build
```

Verify `dist/` was created:

```bash
ls dist/
# Should show: assets  index.html  vite.svg
```

### 3.4 Install server dependencies

```bash
cd /var/www/student-crud/server
npm install --production
```

### 3.5 Test the server locally on the VPS

```bash
cd /var/www/student-crud/server
PORT=3000 node index.js
```

You should see: `Billing API listening on port 3000`. Test it:

```bash
# Open a second SSH session (or press Ctrl+C to stop, then use curl after starting with PM2)
curl http://127.0.0.1:3000/health
# Should return: {"status":"ok"}
```

Stop with **Ctrl+C**.

> **Note:** Do NOT try `http://YOUR_VPS_IP:3000` from a browser — most VPS providers (including Hostinger) block non-standard ports. We'll use Nginx on port 80/443 instead.

### 3.6 Run with PM2

**Important:** Use `--cwd` so the server can find its `.env` file.

```bash
pm2 start /var/www/student-crud/server/index.js --name student-crud --cwd /var/www/student-crud/server -i 1
pm2 save
pm2 startup
```

`pm2 startup` prints a line like `sudo env PATH=...`. If it does, copy and run that line. Otherwise PM2 already configured it.

Verify:

```bash
pm2 status
# student-crud should be "online"

pm2 logs student-crud --lines 5
# Should show: Billing API listening on port 3000

curl http://127.0.0.1:3000/health
# Should return: {"status":"ok"}
```

Press **Q** or **Ctrl+C** to exit the logs screen.

---

## Part 4: Set up Nginx (serves frontend + proxies API)

Nginx serves the built frontend directly from `dist/` and forwards `/api` requests to Express. This is faster and avoids the Express server needing to serve static files.

### 4.1 Create the Nginx config

Use `cat` (not nano) to avoid paste issues:

```bash
cat > /etc/nginx/sites-available/student-crud << 'EOF'
server {
    listen 80;
    server_name 195.35.21.236 billing.tuljasystems.com;

    root /var/www/student-crud/dist;
    index index.html;

    # API requests → Express on port 3000
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health endpoint → Express
    location /health {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # Everything else → frontend SPA (React Router)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
```

### 4.2 Enable the site, remove default, reload

```bash
ln -sf /etc/nginx/sites-available/student-crud /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

`nginx -t` must say **syntax is ok** and **test is successful**.

### 4.3 Verify in browser

Open: **http://195.35.21.236**

You should see the **login page**.

Also try: **http://195.35.21.236/health** — should return `{"status":"ok"}`.

---

## Part 5: Point billing.tuljasystems.com to the VPS

### 5.1 Add DNS record in Namecheap

1. Log in to [Namecheap](https://www.namecheap.com) → **Domain List** → **Manage** next to **tuljasystems.com**.
2. Open the **Advanced DNS** tab.
3. Click **ADD NEW RECORD** and add:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A Record | billing | 195.35.21.236 | Automatic |

4. Do **not** change your existing `@` or `www` records.
5. Click **Save**.

### 5.2 Wait for DNS (5–30 minutes)

Check propagation:

```bash
dig billing.tuljasystems.com +short
# Should show: 195.35.21.236
```

Or use [dnschecker.org/#A/billing.tuljasystems.com](https://dnschecker.org/#A/billing.tuljasystems.com).

### 5.3 Test

Open: **http://billing.tuljasystems.com**

You should see the login page.

---

## Part 6: HTTPS with Let's Encrypt

### 6.1 Get the SSL certificate

On the VPS:

```bash
certbot --nginx -d billing.tuljasystems.com
```

Follow the prompts (email, agree to terms). Certbot automatically updates the Nginx config for HTTPS and sets up auto-renewal.

### 6.2 Verify

Open: **https://billing.tuljasystems.com**

You should see the login page with a padlock icon (HTTPS).

---

## Part 7: Update Supabase

1. Supabase Dashboard → **Authentication** → **URL Configuration**.
2. Set **Site URL** to: **`https://billing.tuljasystems.com`**
3. Under **Redirect URLs**, add:
   - `https://billing.tuljasystems.com`
   - `https://billing.tuljasystems.com/`
4. Save.

---

## Part 8: Final checks

- **App:** **https://billing.tuljasystems.com** shows the login page.
- **API:** **https://billing.tuljasystems.com/health** returns `{"status":"ok"}`.
- **Login:** Sign in → lands on the dashboard.
- **New user:** Sign up → Complete "Create your shop" → dashboard.

---

## Part 9: Updating the app later

```bash
cd /var/www/student-crud
git pull

# Rebuild frontend
export VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
export VITE_SUPABASE_ANON_KEY=your_anon_key
npm run build

# Restart the API
pm2 restart student-crud
```

---

## Useful commands

| Task | Command |
|------|---------|
| Check app status | `pm2 status` |
| View logs | `pm2 logs student-crud` |
| Restart app | `pm2 restart student-crud` |
| Stop app | `pm2 stop student-crud` |
| Check Nginx config | `nginx -t` |
| Reload Nginx | `systemctl reload nginx` |
| Renew SSL manually | `certbot renew` |
| Check firewall | `ufw status` |

---

## Troubleshooting

| Problem | What to check |
|---------|---------------|
| Can't SSH | Correct IP, port 22 open in firewall and Hostinger panel, correct password. |
| `curl localhost:3000` fails | Run `pm2 logs student-crud` — if it says "SUPABASE_URL must be set", PM2 wasn't started with `--cwd /var/www/student-crud/server`. Fix: `pm2 delete student-crud` then restart with `--cwd` (see 3.6). |
| Port 3000 times out from browser | Normal — most VPS providers block non-standard ports. Use Nginx on port 80 instead (Part 4). |
| `{"error":"Not found"}` in browser | Nginx is proxying to Express but Express doesn't serve `dist/`. Use the Nginx config from Part 4 (with `root /var/www/student-crud/dist` and `try_files`). |
| "Add shop name" after login | Same Supabase project for frontend and API; `SUPABASE_JWT_SECRET` set in `server/.env`; user/tenant rows exist in DB. |
| Domain not loading | DNS: `dig billing.tuljasystems.com +short` should show VPS IP. Nginx: `nginx -t` and `systemctl status nginx`. |
| SSL errors | `certbot --nginx -d billing.tuljasystems.com`; ensure port 443 open (`ufw allow 443`). |

---

## Summary checklist

- [ ] VPS created and SSH access works
- [ ] Node 20, Git, Nginx, PM2, UFW installed (Part 2)
- [ ] Repo cloned to `/var/www/student-crud`
- [ ] `server/.env` created with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, PORT=3000
- [ ] Frontend built (`dist/` exists with `index.html`)
- [ ] PM2 running with `--cwd /var/www/student-crud/server`; `pm2 save` and `pm2 startup` done
- [ ] Nginx config: serves `dist/` for frontend, proxies `/api` and `/health` to Express
- [ ] Namecheap: A record `billing` → `195.35.21.236`
- [ ] Certbot: HTTPS works for `billing.tuljasystems.com`
- [ ] Supabase: Site URL and Redirect URLs set to `https://billing.tuljasystems.com`

After this, your app is live at **https://billing.tuljasystems.com**.

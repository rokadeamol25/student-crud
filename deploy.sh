#!/usr/bin/env bash
set -e
cd /var/www/student-crud

git pull origin main

# Install dependencies if needed
npm install
npm install --prefix server

# Build frontend (uses VITE_* from env if set)
npm run build

# Restart backend
pm2 restart student-crud

echo "Deploy done."

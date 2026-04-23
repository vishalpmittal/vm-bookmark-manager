#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
ARTIFACTS="$ROOT/artifacts"

echo "==> Cleaning artifacts/"
rm -rf "$ARTIFACTS"
mkdir -p "$ARTIFACTS"

echo "==> Installing dependencies"
cd "$ROOT"
npm ci --silent

echo "==> Building dist/app.js"
npm run build --silent

# --- Distribution 1: Local browser zip ---
echo "==> Creating local browser distribution"
LOCAL="$ARTIFACTS/_local_staging"
mkdir -p "$LOCAL/dist" "$LOCAL/bookmarks-data"

cp "$ROOT/index.html" "$ROOT/styles.css" "$LOCAL/"
cp "$ROOT/dist/app.js" "$LOCAL/dist/"
cp "$ROOT/bookmarks-data/bookmarks.csv" "$ROOT/bookmarks-data/folders.csv" "$LOCAL/bookmarks-data/"

(cd "$LOCAL" && zip -qr "$ARTIFACTS/vm-bookmarks-local.zip" .)
rm -rf "$LOCAL"

# --- Distribution 2: Docker ---
echo "==> Creating Docker distribution"
DOCKER="$ARTIFACTS/docker"
mkdir -p "$DOCKER/dist" "$DOCKER/bookmarks-data"

cp "$ROOT/index.html" "$ROOT/styles.css" "$DOCKER/"
cp "$ROOT/dist/app.js" "$DOCKER/dist/"
cp "$ROOT/bookmarks-data/bookmarks.csv" "$ROOT/bookmarks-data/folders.csv" "$DOCKER/bookmarks-data/"
cp "$ROOT/deploy/docker/Dockerfile" "$ROOT/deploy/docker/nginx.conf" "$DOCKER/"

# --- Distribution 3: Terraform (GCP) ---
echo "==> Creating Terraform GCP distribution"
GCP="$ARTIFACTS/terraform/gcp"
mkdir -p "$GCP"
cp "$ROOT/deploy/terraform/gcp/"*.tf "$GCP/"

echo ""
echo "==> Build complete. Artifacts:"
echo ""
echo "  artifacts/vm-bookmarks-local.zip"
echo "    Extract and open index.html in Chrome/Edge."
echo "    Point the app at the bookmarks-data/ folder for sample data."
echo ""
echo "  artifacts/docker/"
echo "    cd artifacts/docker"
echo "    docker build -t vm-bookmarks ."
echo "    docker run -p 8080:80 vm-bookmarks"
echo "    Open http://localhost:8080 in Chrome/Edge."
echo ""
echo "  artifacts/terraform/gcp/"
echo "    cd artifacts/terraform/gcp"
echo "    terraform init"
echo "    terraform apply -var='project_id=YOUR_GCP_PROJECT'"
echo "    Requires: gcloud auth, Docker daemon running."
echo ""

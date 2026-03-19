#!/bin/bash
set -e

echo "[*] WiFi Lab Setup"
echo "[*] Updating packages..."
apt update

echo "[*] Installing dependencies..."
apt install -y nodejs npm aircrack-ng

echo "[*] Installing Node.js packages..."
cd "$(dirname "$0")/.."
npm install --production

echo "[*] Checking aircrack-ng..."
if command -v aircrack-ng &> /dev/null; then
    echo "[+] aircrack-ng installed: $(aircrack-ng --version 2>&1 | head -1)"
else
    echo "[-] ERROR: aircrack-ng not found!"
    exit 1
fi

echo "[*] Checking node..."
echo "[+] Node.js: $(node --version)"

echo ""
echo "[+] Setup complete!"
echo "[+] Run: sudo node server/index.js"
echo "[+] Then open: http://localhost:3000"

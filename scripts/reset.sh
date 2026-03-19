#!/bin/bash
echo "[*] Resetting WiFi Lab network state..."

pkill -f airodump-ng 2>/dev/null || true
pkill -f aireplay-ng 2>/dev/null || true
pkill -f aircrack-ng 2>/dev/null || true

airmon-ng check kill 2>/dev/null || true

for iface in $(iw dev | grep Interface | awk '{print $2}' | grep mon); do
    echo "[*] Stopping monitor mode on $iface"
    airmon-ng stop "$iface" 2>/dev/null || true
done

systemctl restart NetworkManager 2>/dev/null || true

rm -f /tmp/wifilab_capture* 2>/dev/null || true

echo "[+] Reset complete"

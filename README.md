# WiFi Lab

Interactive WiFi penetration testing lab for conference booths.

## What is this?

A web-based guided experience where participants perform a real WPA2 WiFi attack
on a controlled router, step by step. Built for the Socol SOC conference booth
by Meta Scan red team.

## Hardware Required

- Laptop (any, will boot from USB)
- Kali Linux Live USB with persistence (download Live ISO from kali.org, flash with Rufus)
- USB WiFi adapter with monitor mode support (e.g., Alfa AWUS036ACH)
- WiFi router configured with WPA2-PSK and a weak password
- Client device (phone/tablet) connected to the target router

## Quick Start

```bash
# On Kali Linux
sudo bash scripts/setup.sh
sudo node server/index.js
# Open http://localhost:3000
```

## Configuration

Edit `server/steps.json` to set your router's details:
- `target_bssid` — MAC address of your router
- `target_ssid` — WiFi network name
- `target_channel` — Router's WiFi channel

Add your router's password to `server/wordlist.txt` (place it around line 300-500 for a realistic brute force duration).

## Tech Stack

Node.js, Express, xterm.js, node-pty, WebSocket

## Architecture

- **Frontend:** Single page with 40/60 split — chat-style guide (left) + dual terminal (right)
- **Backend:** Express server with WebSocket endpoints for terminal I/O and guide state
- **Step Engine:** JSON-configured 8-step attack scenario with auto-validation of terminal output
- **Session Manager:** Auto-reset after 5 min inactivity, session logging for booth analytics

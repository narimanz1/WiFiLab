# WiFi Lab — Design Document

Interactive WiFi penetration testing lab for the Socol SOC conference booth by Meta Scan red team.

## Overview

A web-based interactive experience where conference attendees perform a guided WPA2 WiFi attack on a controlled router. The interface presents a chat-style mentor guide alongside a real Linux terminal, walking participants through each step of a WiFi penetration test.

**Goal:** "Feel like a hacker" — educational, engaging, self-contained booth experience.

**Language:** Russian (the conference and audience are Russian-speaking). All UI text, guide messages, hints, and completion screens are in Russian.

## Hardware Setup

| Component | Details |
|-----------|---------|
| **Laptop** | Any laptop, booted from Kali Live USB/SSD with persistence |
| **Boot media** | Kali Linux Live ISO via Rufus, ext4 persistence partition, GRUB → "Live USB Persistence" |
| **USB WiFi adapter** | Monitor mode + packet injection capable (Alfa AWUS036ACH or RTL8812AU chipset) |
| **WiFi router** | WPA2-PSK with intentionally weak password (present in the dictionary file) |
| **Client device** | Phone/tablet connected to the router (needed for deauth → handshake capture) |

### Why Kali Live Boot (not VirtualBox)

VirtualBox USB passthrough for WiFi adapters in monitor mode is unreliable. Live boot gives direct hardware access — critical for `aircrack-ng` suite to work consistently at a conference booth where reliability is non-negotiable.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Laptop (Kali Live)             │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │           Node.js Application               │ │
│  │                                             │ │
│  │  ┌──────────────┐  ┌────────────────────┐   │ │
│  │  │ Express      │  │ Step Engine        │   │ │
│  │  │ Server       │  │                    │   │ │
│  │  │              │  │ • steps.json config│   │ │
│  │  │ • Static     │  │ • Output pattern   │   │ │
│  │  │   files      │  │   matching         │   │ │
│  │  │ • WebSocket  │  │ • Session timer    │   │ │
│  │  │   (terminal) │  │ • Auto-reset       │   │ │
│  │  │ • WebSocket  │  │   on timeout       │   │ │
│  │  │   (guide)    │  │                    │   │ │
│  │  └──────────────┘  └────────────────────┘   │ │
│  │         │                    │               │ │
│  │         ▼                    ▼               │ │
│  │  ┌──────────────┐  ┌────────────────────┐   │ │
│  │  │ node-pty ×2  │  │ Validator          │   │ │
│  │  │ (main shell  │──│ (monitors stdout   │   │ │
│  │  │ + capture)   │  │  from both PTYs)   │   │ │
│  │  └──────────────┘  └────────────────────┘   │ │
│  └─────────────────────────────────────────────┘ │
│                       │                          │
│  ┌────────────────────▼────────────────────────┐ │
│  │            Browser (localhost)               │ │
│  │  ┌───────────────┬─────────────────────┐    │ │
│  │  │  Chat Guide   │  ┌─────────────────┐ │    │ │
│  │  │  (40%)        │  │ Main Terminal   │ │    │ │
│  │  │               │  │ (xterm.js #1)   │ │    │ │
│  │  │  Mentor msgs  │  ├─────────────────┤ │    │ │
│  │  │  Hints        │  │ Capture Monitor │ │    │ │
│  │  │  Buttons      │  │ (xterm.js #2)   │ │    │ │
│  │  │               │  └─────────────────┘ │    │ │
│  │  └───────────────┴──────────────────────┘    │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
         │                          │
    ┌────▼────┐              ┌──────▼──────┐
    │ USB WiFi│              │ WiFi Router │
    │ Adapter │ )))))))  ((( │ WPA2-PSK    │
    │ mon mode│              │ + client    │
    └─────────┘              └─────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js + Express |
| **Terminal** | xterm.js (frontend) + node-pty (backend) + ws (WebSocket) |
| **Frontend** | Vanilla HTML / CSS / JS (no frameworks) |
| **Guide engine** | JSON step config, WebSocket push to client |
| **Validation** | Regex pattern matching on terminal stdout stream |

### Why this stack

- `xterm.js` + `node-pty` is the same stack VS Code uses for its terminal — battle-tested
- Vanilla frontend = zero build step, easy to modify on-site, minimal dependencies
- Everything runs on localhost, no internet required

## Frontend Layout

**40/60 split — single page:**

```
┌──────────────────┬────────────────────────────┐
│                  │                            │
│   CHAT GUIDE     │      TERMINAL              │
│   (40%)          │      (60%)                 │
│                  │                            │
│  ┌────────────┐  │  ┌──────────────────────┐  │
│  │ Mentor msg │  │  │ ┌──(kali㉿kali)-[~]  │  │
│  │            │  │  │ └─$ _                 │  │
│  └────────────┘  │  │                       │  │
│  ┌────────────┐  │  │                       │  │
│  │ Mentor msg │  │  │                       │  │
│  │            │  │  │                       │  │
│  └────────────┘  │  │                       │  │
│                  │  │                       │  │
│  ┌────┐ ┌────┐  │  └──────────────────────┘  │
│  │Hint│ │Done│  │                            │
│  └────┘ └────┘  │                            │
│                  │                            │
│  [Step 3/7]      │                            │
│  ▓▓▓▓░░░ 43%    │                            │
└──────────────────┴────────────────────────────┘
```

### Chat Guide Panel (left, 40%)

- Messages appear sequentially like a chat conversation
- Mentor "persona" — friendly, encouraging tone
- Each step message contains:
  - What the participant needs to accomplish (goal)
  - Which tool to use
  - Key flags/options as hints (not full commands)
- Buttons at bottom: "Hint" (progressive hints) and "Done" (manual step completion)
- Progress bar showing current step out of total

### Terminal Panel (right, 60%)

Two stacked terminal panes, each backed by its own node-pty instance:

- **Main Terminal (top, ~65% of terminal area):** Full interactive bash shell. Participant types commands here. Connected via xterm.js + WebSocket to a dedicated node-pty process.
- **Capture Monitor (bottom, ~35% of terminal area):** Read-only view managed by the Step Engine. During steps 4-6 the engine automatically launches `airodump-ng` targeting the specific network here, so the participant can watch captured packets and handshake status while executing `aireplay-ng` in the main terminal. Hidden during steps that don't need it (steps 1-3, 7).

Both terminal outputs are streamed to the Step Engine for auto-validation. This solves the concurrency problem: `airodump-ng` must run continuously while `aireplay-ng` sends deauth packets in parallel.

```
┌──────────────────┬────────────────────────────┐
│                  │  MAIN TERMINAL (65%)       │
│   CHAT GUIDE     │  ┌──(kali㉿kali)-[~]      │
│   (40%)          │  └─$ aireplay-ng ...       │
│                  ├────────────────────────────┤
│                  │  CAPTURE MONITOR (35%)     │
│                  │  airodump-ng output...     │
│                  │  WPA handshake: AA:BB:CC   │
└──────────────────┴────────────────────────────┘
```

## Visual Style

**Hacker / Matrix theme with good readability:**

- Background: `#0a0f0a` (not pure black — easier on eyes)
- Primary text: `#33ff33` (bright green, good contrast)
- Secondary text: `#1a9c1a` (dimmer green for less important info)
- Accent glow: `text-shadow: 0 0 6px #0f0` — only on headers and key elements, NOT on body text
- Font: `'JetBrains Mono', 'Fira Code', monospace` for both panels
- Font size: 14-15px minimum for readability at conference booth distance
- Minimum display resolution: 1920x1080 (airodump-ng output needs 120+ columns in the terminal pane)
- Terminal: standard Kali colors (xterm.js theme override)
- Guide panel: slightly lighter background (`#0d140d`) to visually separate from terminal

## Step Engine

### Step Configuration (steps.json)

Each step is a JSON object:

```json
{
  "id": "monitor_mode",
  "order": 2,
  "title": "Режим мониторинга",
  "messages": [
    "Сейчас нужно перевести WiFi-адаптер в режим мониторинга. Это позволит перехватывать пакеты в эфире.",
    "Используй airmon-ng с параметром start и именем интерфейса."
  ],
  "hints": [
    "Сначала посмотри доступные интерфейсы: iwconfig или airmon-ng",
    "Команда: airmon-ng start <interface>",
    "Полная команда: sudo airmon-ng start wlan0"
  ],
  "validation": {
    "type": "output_match",
    "pattern": "(wlan\\d+mon|monitor mode)",
    "timeout_sec": 120
  },
  "on_success": "Отлично! Видишь интерфейс в режиме мониторинга? Теперь мы можем слушать эфир."
}
```

### Validation Logic

- Backend streams terminal stdout through the Step Engine
- Engine applies current step's regex pattern to output
- On match → sends "step_complete" event via WebSocket → guide advances
- If no match within timeout → no action (participant can use hints or click "Done")
- "Done" button → force-advance regardless of validation

### Hint Progression

Hints reveal progressively — first click shows hint 1, second shows hint 2, etc. Final hint is the full command. This way participants who are stuck aren't blocked.

## Attack Scenario Steps

**Target BSSID is configured in steps.json** (e.g., `"target_bssid": "AA:BB:CC:DD:EE:FF"`) and used for validation patterns and the auto-launched airodump-ng capture.

| # | Step | Tool | Terminal | Validation Pattern | Notes |
|---|------|------|----------|--------------------|-------|
| 1 | Welcome | — | — | Click "Start" | Intro screen |
| 2 | Kill interfering processes | `airmon-ng check kill` | Main | `Killing these processes` | Prevents NetworkManager interference |
| 3 | Enable monitor mode | `airmon-ng start` | Main | `(wlan\d+mon\|monitor mode)` | |
| 4 | Scan for networks | `airodump-ng` | Main | `{target_bssid}` in output | Participant sees target SSID in scan |
| 5 | Target & capture | `airodump-ng` with filters | **Capture Monitor** (auto-launched by engine) | `CH\s+\d+.*{target_bssid}` | Engine launches: `airodump-ng -c {ch} --bssid {bssid} -w /tmp/capture wlan0mon` |
| 6 | Deauth client | `aireplay-ng` | Main | `(DeAuth\|deauthentication)` | Participant runs deauth while capture monitor watches |
| 7 | Handshake captured | (waiting) | Capture Monitor | `WPA handshake:\s*{target_bssid}` | Auto-detected in capture monitor output |
| 8 | Crack with dictionary | `aircrack-ng` | Main | `KEY FOUND!` | Engine stops capture monitor before this step |

### Capture Monitor Lifecycle

- **Step 5:** Step Engine automatically spawns `airodump-ng` in the Capture Monitor pane with the correct BSSID, channel, and output file. Participant does NOT need to type this command.
- **Steps 6-7:** Capture Monitor stays running. Participant works in Main Terminal for deauth.
- **Step 8:** Engine kills the capture monitor process, hides the pane. Participant runs `aircrack-ng` in Main Terminal with the capture file path shown in the guide.

### Router Configuration

- SSID: something themed (e.g., `SOCOL_TARGET` or `Corp_WiFi_5G`)
- Security: WPA2-PSK
- Password: short, in provided wordlist (e.g., `security2024`)
- A client device (phone) must be connected for deauth to trigger handshake
- Wordlist: small custom file (~1000 words) with the password placed ~200-500 entries in (so brute force takes a few seconds, not instant)

## Session Management

### Auto-reset

- Inactivity timer: 5 minutes with no terminal input, no guide interaction, AND no terminal output (active processes like airodump-ng producing output keep the session alive)
- Warning at 4 minutes: "Still there? Session will reset in 60 seconds..."
- On reset:
  1. Kill any running aircrack processes
  2. Restart network interfaces (`airmon-ng check kill`, reset adapter)
  3. Clear terminal
  4. Reset guide to welcome screen
  5. Clear session timer

### Manual Reset

- "Reset" button always visible (header or corner)
- Performs same cleanup as auto-reset
- Optional: admin keybind (e.g., Ctrl+Shift+R) for booth operator

### Completion Screen

When the participant finds the WiFi password:

- Congratulations animation (Matrix-style rain or similar)
- Summary stats:
  - Time taken
  - Number of hints used
  - Steps completed
- QR code linking to additional materials (blog post, tools list, learning resources)
- "Start Over" button

## File Structure

```
WiFiLab/
├── server/
│   ├── index.js              # Express + WebSocket server
│   ├── terminal.js           # node-pty management (main + capture monitor)
│   ├── stepEngine.js         # Step validation & progression
│   ├── sessionManager.js     # Reset, timeout, cleanup
│   ├── steps.json            # Step configuration
│   └── wordlist.txt          # Dictionary for aircrack-ng (not web-accessible)
├── public/
│   ├── index.html            # Main page
│   ├── css/
│   │   └── style.css         # Matrix theme
│   ├── js/
│   │   ├── app.js            # Main app logic
│   │   ├── terminal.js       # xterm.js setup + WebSocket
│   │   ├── guide.js          # Chat guide panel logic
│   │   └── completion.js     # Final screen + stats
│   └── assets/               # Static assets (images, fonts)
├── scripts/
│   ├── setup.sh              # Install dependencies on Kali
│   └── reset.sh              # Network interface reset script
├── package.json
└── README.md
```

## Deployment on Kali Live

### Setup Script (setup.sh)

```bash
#!/bin/bash
# Run once after booting Kali Live with persistence
apt update
apt install -y nodejs npm aircrack-ng
cd /home/kali/WiFiLab
npm install
```

### Launch

```bash
cd /home/kali/WiFiLab
sudo node server/index.js
# Opens on http://localhost:3000
```

`sudo` required because `airmon-ng` and `aireplay-ng` need root privileges, and node-pty spawns a root shell.

### Auto-start (optional)

Systemd service for persistence (runs as root):
```ini
# /etc/systemd/system/wifilab.service
[Unit]
Description=WiFi Lab Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/kali/WiFiLab
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Browser kiosk (separate service or autostart entry):
```bash
# /etc/xdg/autostart/wifilab-browser.desktop
[Desktop Entry]
Type=Application
Name=WiFi Lab Browser
Exec=chromium --kiosk http://localhost:3000
```

Chromium in kiosk mode = fullscreen browser, no address bar. `Restart=always` on the server ensures recovery from crashes. Chromium autostart handles browser restarts on login.

## Error Handling

| Scenario | Handling |
|----------|----------|
| WiFi adapter not found | Guide shows "Connect USB adapter" message, polls every 2 seconds |
| Router not in range | Scan step shows "No target network found — check router is on" |
| Handshake capture fails | Hint suggests retrying deauth, offer to auto-retry |
| aircrack-ng not installed | setup.sh check at server start, clear error message |
| Browser disconnects | WebSocket auto-reconnect: server holds session state in memory (current step, hint count, message history, timer). On reconnect client sends `sync` message, server replays current state. Server crash = full reset (acceptable — reset is fast) |

## Session Logging

Each completed (or abandoned) session is appended as a JSON line to `server/sessions.log`:

```json
{"timestamp":"2026-03-20T14:30:00Z","completed":true,"duration_sec":840,"steps_reached":8,"hints_used":5}
```

This data helps evaluate booth engagement: how many people completed, where they dropped off, average time.

## Security Considerations

- Application runs on localhost only — not exposed to network
- The router and attack are fully self-contained on the booth's hardware
- No real networks are targeted — the router is controlled by Meta Scan
- Participants have root shell access but only to the live boot system (no persistent damage)
- Auto-reset cleans up any stale processes between sessions

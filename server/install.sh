#!/bin/bash
# builds ryhome server and runs it in the background: starts at login, restarts if it quits
set -euo pipefail
cd "$(dirname "$0")"

LABEL="app.ryhome.server"
DOMAIN="gui/$(id -u)"
INSTALL_DIR="$HOME/Library/Application Support/RyHome"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/RyHome"
LOG="$LOG_DIR/server.log"
CONFIG="${RYHOME_HOME:-$HOME/.ryhome}/config.json"
MIN_NODE="22.13.0"

step() { printf "\n\033[1;34m==>\033[0m \033[1m%s\033[0m\n" "$1"; }
note() { printf "    %s\n" "$1"; }
# plutil prints its "no value" error to stdout, so read the json with node instead
config_value() {
  node -e 'try { const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))[process.argv[2]]; if (v != null) console.log(v) } catch {}' "$CONFIG" "$1"
}
version_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n 1)" == "$2" ]]; }

if [[ "$(uname)" != "Darwin" ]]; then
  echo "RyHome Server only runs on macOS."
  exit 1
fi

step "Checking Node.js"
if ! command -v node >/dev/null 2>&1; then
  note "Node.js $MIN_NODE or newer is required. Install it with Homebrew (brew install node)"
  note "or from https://nodejs.org, then run ./install.sh again."
  exit 1
fi
NODE_VERSION="$(node -p 'process.versions.node')"
if ! version_ge "$NODE_VERSION" "$MIN_NODE"; then
  note "Found Node.js $NODE_VERSION, but RyHome needs $MIN_NODE or newer."
  exit 1
fi
NODE="$(command -v node)"
note "Found Node.js $NODE_VERSION."

if ! xcode-select -p >/dev/null 2>&1; then
  xcode-select --install >/dev/null 2>&1 || true
  note "A window just opened to install Apple's command line tools."
  note "Run ./install.sh again once that finishes."
  exit 1
fi

step "Building"
npm ci --no-fund --no-audit --loglevel=error
npm run build --silent
cc -O2 -o .ryhome-server launcher.c

step "Installing"
mkdir -p "$INSTALL_DIR" "$LOG_DIR" "$HOME/Library/LaunchAgents"
launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
# bootout returns before the old service is fully gone, and registering again too early fails
for _ in $(seq 1 30); do
  launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || break
  sleep 0.5
done
rm -rf "$INSTALL_DIR/dist"
cp -R dist package.json package-lock.json "$INSTALL_DIR/"
(cd "$INSTALL_DIR" && npm ci --omit=dev --no-fund --no-audit --loglevel=error)
ENTRY="$INSTALL_DIR/dist/main.js"
LAUNCHER="$INSTALL_DIR/ryhome-server"
# a rebuilt launcher loses full disk access, so only replace it when it actually changed
if ! cmp -s .ryhome-server "$LAUNCHER"; then
  rm -f "$LAUNCHER"
  cp .ryhome-server "$LAUNCHER"
fi
rm -f .ryhome-server
"$NODE" "$ENTRY" --pairing-code >/dev/null

port_in_use() { nc -z -G 1 127.0.0.1 "$1" >/dev/null 2>&1; }
PORT="$(config_value port)"
if port_in_use "$PORT"; then
  FREE="$PORT"
  while port_in_use "$FREE"; do
    FREE=$((FREE + 1))
  done
  note "Port $PORT is already taken, so RyHome will use $FREE."
  "$NODE" "$ENTRY" --set-port "$FREE" | sed 's/^/    /'
fi

CURRENT_URL="$(config_value advertisedURL)"
if [[ -z "$CURRENT_URL" || "$CURRENT_URL" =~ ^http://100\. ]]; then
  TAILSCALE=""
  for candidate in tailscale /Applications/Tailscale.app/Contents/MacOS/Tailscale; do
    if command -v "$candidate" >/dev/null 2>&1; then
      TAILSCALE="$candidate"
      break
    fi
  done
  TAILSCALE_IP="$([[ -n "$TAILSCALE" ]] && "$TAILSCALE" ip -4 2>/dev/null | head -n 1 || true)"
  # the app store build of tailscale has no cli on the path, so fall back to its 100.64.0.0/10 address
  if [[ -z "$TAILSCALE_IP" ]]; then
    TAILSCALE_IP="$(ifconfig 2>/dev/null | awk '$1 == "inet" && $2 ~ /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./ { print $2; exit }')"
  fi
  TAILSCALE_NAME=""
  if [[ -n "$TAILSCALE_IP" ]]; then
    TAILSCALE_NAME="$(dig +short +time=2 +tries=1 -x "$TAILSCALE_IP" @100.100.100.100 2>/dev/null | head -n 1 | sed 's/\.$//' || true)"
  fi
  TAILSCALE_URL="http://${TAILSCALE_NAME:-$TAILSCALE_IP}:$(config_value port)"
  if [[ -n "$TAILSCALE_IP" && "$CURRENT_URL" != "$TAILSCALE_URL" ]]; then
    answer=""
    read -r -p "    Use your Tailscale address (${TAILSCALE_NAME:-$TAILSCALE_IP}) in the pairing code? [Y/n] " answer || true
    if [[ ! "$answer" =~ ^[Nn] ]]; then
      "$NODE" "$ENTRY" --set-advertised-url "$TAILSCALE_URL" | sed 's/^/    /'
    fi
  fi
fi

step "Setting it to start automatically"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$LAUNCHER</string>
        <string>$NODE</string>
        <string>--disable-warning=ExperimentalWarning</string>
        <string>$ENTRY</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/bin:/bin:/usr/sbin:/sbin:$(dirname "$NODE")</string>
        <key>NO_COLOR</key>
        <string>1</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProcessType</key>
    <string>Interactive</string>
    <key>StandardOutPath</key>
    <string>$LOG</string>
    <key>StandardErrorPath</key>
    <string>$LOG</string>
</dict>
</plist>
PLIST
touch "$LOG"
chmod 600 "$LOG"
for attempt in $(seq 1 10); do
  if BOOTSTRAP_ERROR="$(launchctl bootstrap "$DOMAIN" "$PLIST" 2>&1)"; then
    break
  fi
  if [[ $attempt == 10 ]]; then
    echo "Couldn't register the background service: $BOOTSTRAP_ERROR"
    echo "Try: launchctl bootstrap $DOMAIN \"$PLIST\""
    exit 1
  fi
  sleep 1
done
launchctl enable "$DOMAIN/$LABEL"
note "Starts when you log in and restarts itself if it ever quits."

PORT="$(config_value port)"
TOKEN="$(config_value token)"
capabilities() {
  curl -fsS -m 3 -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/v1/capabilities" 2>/dev/null || true
}
wait_for_server() {
  for _ in $(seq 1 30); do
    local body
    body="$(capabilities)"
    if [[ -n "$body" ]]; then
      echo "$body"
      return 0
    fi
    sleep 1
  done
  return 1
}

step "Starting"
if ! CAPS="$(wait_for_server)"; then
  echo "The server didn't come up. Last log lines:"
  tail -n 20 "$LOG"
  exit 1
fi
note "Running on port $PORT."

if [[ "$CAPS" != *'"homeKitNames":true'* ]]; then
  step "Optional: use your Home app names and rooms"
  note "RyHome can read accessory names and rooms from the Home app's database (read-only)."
  note "That needs Full Disk Access for ryhome-server. Without it, lights use their built-in names"
  note "and you can rename them in $CONFIG."
  answer=""
  read -r -p "    Set up Full Disk Access now? [y/N] " answer || true
  if [[ "$answer" =~ ^[Yy] ]]; then
    note "1. System Settings is opening at Privacy & Security > Full Disk Access."
    note "2. A Finder window is opening with ryhome-server selected."
    note "3. Drag ryhome-server into the list and make sure its switch is on."
    note "   Already listed from an earlier install? Remove it with the minus button, then add it again."
    open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
    open -R "$LAUNCHER"
    read -r -p "    Press Return once it's switched on... " _ || true
    launchctl kickstart -k "$DOMAIN/$LABEL"
    CAPS="$(wait_for_server || true)"
    if [[ "$CAPS" == *'"homeKitNames":true'* ]]; then
      note "RyHome can read your Home app names now."
    else
      note "Still no access. You can come back to this any time by running ./install.sh again."
    fi
  fi
fi

if [[ "$CAPS" != *'"climate":true'* ]]; then
  step "Optional: HomePod temperature and humidity"
  note "Make a shortcut named \"$(config_value climateShortcut | grep . || echo 'RyHome Climate')\" that outputs a dictionary like"
  note "{\"room\": \"Living Room\", \"temperature\": 72, \"unit\": \"F\", \"humidity\": 41}"
  note "(or a list of them). RyHome picks it up within 10 minutes. See README for details."
fi

step "Staying available"
if fdesetup isactive >/dev/null 2>&1; then
  note "FileVault is on, so after a restart the Mac waits at the unlock screen and RyHome"
  note "won't run until someone logs in. For planned restarts use: sudo fdesetup authrestart"
elif [[ -n "$(defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null || true)" ]]; then
  note "Automatic login is on, so RyHome comes back by itself after a restart or power cut."
else
  note "Turn on automatic login (System Settings > Users & Groups) so RyHome comes back"
  note "by itself after a restart or power cut."
fi
SLEEP_MINUTES="$(pmset -g 2>/dev/null | awk '$1 == "sleep" { print $2 }')"
if [[ -n "$SLEEP_MINUTES" && "$SLEEP_MINUTES" != "0" ]]; then
  note "This Mac sleeps after $SLEEP_MINUTES minutes idle, which takes RyHome offline."
  note "To keep it awake: sudo pmset -a sleep 0"
fi

step "Pair your PC"
note "Paste this into RyHome on Windows:"
echo
echo "    $("$NODE" "$ENTRY" --pairing-code)"
echo
note "Logs:    $LOG"
note "Update:  git pull, then ./install.sh again"
note "Remove:  ./uninstall.sh"

#!/bin/bash
set -euo pipefail

LABEL="app.ryhome.server"
launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
rm -rf "$HOME/Library/Application Support/RyHome"

echo "RyHome Server is stopped and removed."
echo "Your token, scenes, and Matter pairings are kept in ~/.ryhome."
echo "To fully unpair lights, remove RyHome from each light in the Home app"
echo "(accessory settings > connected services), then delete ~/.ryhome."

# RyHome Server

The macOS companion server. It's a Matter controller for your lights, plus the API in `../docs/api.md` that the Windows client talks to.

Needs macOS and Node.js 22.13 or newer (`brew install node` works).

## Install

On the Mac, logged in as the account that uses the Home app:

```
git clone <your fork or this repo>
cd RyHome/server
./install.sh
```

The script:

1. Builds the server and installs it to `~/Library/Application Support/RyHome/`.
2. Registers a LaunchAgent, so it starts when you log in and restarts itself if it quits. If port 8788 is taken, it moves to the next free port.
3. Offers to put your Tailscale address in the pairing code, if Tailscale is installed.
4. Optionally walks you through **Full Disk Access** for `ryhome-server`, so lights get their names and rooms from the Home app.
5. Prints the pairing code to paste into RyHome on Windows.

**Updating:** `git pull`, then `./install.sh` again.

**Removing:** `./uninstall.sh`. Your token, scenes, and Matter pairings stay in `~/.ryhome`.

**Logs:** `~/Library/Logs/RyHome/server.log`

**Print the pairing code again:** `node ~/Library/Application\ Support/RyHome/dist/main.js --pairing-code`

**Restart:** `launchctl kickstart -k gui/$(id -u)/app.ryhome.server`

## Adding lights

From the Windows app, choose **Add Light** from the ••• menu, pick the light, then in the Home app open that light's settings and tap **Turn On Pairing Mode**. Type the code it shows into RyHome.

This adds RyHome as a second controller. The light stays in the Home app with the same name, room, automations, and Siri. To undo it, use **Light Settings > Remove from RyHome**, which removes only RyHome's own pairing.

Only Matter accessories work this way. Lights that are HomeKit-only can't be added.

The Mac must be on the same local network as the lights, and the network must allow IPv6 and mDNS (most home networks do). On macOS 15 and later, allow the **Local Network** prompt for `ryhome-server`.

## Home app names and rooms

With Full Disk Access, the server reads `~/Library/HomeKit/core.sqlite` read-only to find each light's name and room. When you add a light through the picker, RyHome remembers which Home app accessory it is (`~/.ryhome/links.json`). If you skip the picker, it matches automatically when there's only one accessory of that model, and otherwise you can link it later from **Light Settings**.

Without Full Disk Access, lights use the name the device reports. You can rename them in the config (see below).

The permission belongs to `ryhome-server`, a tiny launcher that starts Node, so it survives Node upgrades. Building it needs Apple's command line tools, which Homebrew already installs.

## HomePod temperature and humidity

HomePod sensors aren't reachable over Matter, so RyHome can read them from a Shortcut instead. Create a shortcut named **RyHome Climate** that ends with a **Dictionary** action like:

| Key | Value |
| --- | --- |
| `room` | Living Room |
| `temperature` | Get state of HomePod temperature |
| `unit` | F or C |
| `humidity` | Get state of HomePod humidity |

For several rooms, output a list of dictionaries. The server checks for the shortcut every 10 minutes and polls it every minute. Use a different name with `climateShortcut` in the config.

## Configuration

`~/.ryhome/config.json` (permissions 600). Restart the server after editing.

| Key | Default | Description |
| --- | --- | --- |
| `token` | generated | Bearer token clients must present. `RYHOME_TOKEN` overrides it. |
| `port` | `8788` | Listening port. |
| `advertisedHost` | auto-detected LAN IP | Host embedded in the pairing code. |
| `advertisedURL` | none | Full URL for the pairing code, overriding host and port. Use this behind a TLS proxy. |
| `allowedOrigins` | all origins | Restrict CORS to specific browser origins. |
| `homeName` | from the Home app | Name shown at the top of the app. |
| `temperatureUnit` | from the Mac's region | `"C"` or `"F"`. |
| `climateShortcut` | `RyHome Climate` | Name of the climate shortcut. |
| `accessories` | none | Per-light overrides keyed by accessory id: `{ "name", "room", "icon", "hidden" }`. Icons: `bulb`, `ceiling`, `floorLamp`, `tableLamp`, `lightstrip`. |

Accessory ids look like `matter-<node>-<endpoint>` and show up in `GET /v1/home`.

`RYHOME_HOME` moves the whole data directory. `RYHOME_MATTER_LOG=info` turns up Matter logging.

## Staying up after reboots

The server runs inside your login session. Turn on automatic login so it comes back after a restart or power cut (not available with FileVault on; use `sudo fdesetup authrestart` for planned restarts), and keep the Mac awake with `sudo pmset -a sleep 0`.

## HTTPS via Tailscale

Only needed for a client served over https:

```
tailscale serve --bg 8788
node ~/Library/Application\ Support/RyHome/dist/main.js --set-advertised-url https://<mac-name>.<tailnet>.ts.net
```

## Pairing code format

`RYH1.` followed by base64url JSON: `{"t":"<token>","u":"<server url>"}`.

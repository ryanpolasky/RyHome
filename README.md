# RyHome

A Windows app for your Matter smart home, styled after Apple's Home app. It talks to your lights directly over Matter, so no hub, Mac, or cloud account is needed, and it works alongside Apple Home, Google Home, Alexa, or whatever app your lights already use.

## How it works

Matter accessories can belong to several controllers at once. You add each light to RyHome by turning on pairing mode in the app it already uses (in Apple Home: the light's settings, then **Turn On Pairing Mode**) and typing the setup code into RyHome. The light keeps working everywhere else exactly as before, and RyHome only ever removes its own pairing.

- Lights (on/off, brightness, color, color temperature) are controlled directly, with live updates when they change anywhere else. Lights can be grouped and saved into scenes.
- Plugs and wall switches, locks, blinds, fans, and thermostats can be controlled too, and temperature, humidity, motion, contact, leak, and light sensors show their readings. Other Matter devices show up so you can rename or remove them, even if RyHome can't control them yet.
- Names, rooms, and icons are set in RyHome.
- Your PC has to be on the same local network as your lights, with IPv6 working (most home networks do).
- Only Matter accessories work. HomeKit-only accessories can't be added.

## Structure

- `client/` - The Windows app. Vite + React + TypeScript in a Tauri 2 shell.
- `core/` - The Matter engine. Node.js + TypeScript using [matter.js](https://github.com/project-chip/matter.js). The app bundles it into one file and runs it in the background on localhost, using a copy of Node.js shipped alongside the app.
- `docs/` - The local API between the two.

## Using it

1. Run RyHome. The first time, Windows Firewall asks whether to allow RyHome's engine on your network. Allow it on **private networks**, or it can't find your lights.
2. Choose **Add Light** from the ••• menu and follow the steps.
3. **Settings** (••• menu or Ctrl+,) has the home name, °F or °C, minimize to tray, launch at login, and backup export and restore. Closing the window keeps RyHome in the tray; quit from the tray icon or Settings.
4. The tray icon's menu has **All Lights Off** and your scenes, so you don't need to open the window for either.

Pair one light first and make sure it still behaves normally in its other apps before adding the rest.

App data (pairings, names, scenes) lives in `%APPDATA%\app.ryhome.client`. Engine logs are in `%LOCALAPPDATA%\app.ryhome.client\logs\core.log`.

## Development

Requires Node.js 22.13 or newer, Rust (MSVC toolchain), and the Visual Studio C++ Build Tools with a Windows SDK.

```
cd client
npm install
npm run tauri dev
```

`npm run tauri` runs `npm run prepare-core` first, which bundles `core/` and copies your Node.js runtime in as the engine binary.

For UI work in a browser, run `npm run dev` and choose **Try the Demo**, which uses built-in fake accessories. The desktop app has the same demo under the ••• menu.

To build the installers (an NSIS setup and an MSI, in `client/src-tauri/target/release/bundle/`):

```
cd client
npm run tauri build
```

They aren't code signed, so Windows SmartScreen will warn on first run.

To run the engine by itself for API work:

```
cd core
npm install
npm run dev
```

Set `RYHOME_TOKEN`, `RYHOME_PORT`, and `RYHOME_HOME` to control the token, port, and data folder. `RYHOME_MATTER_LOG=info` turns up Matter logging.

## Disclaimer

This is an independent personal project. It is not affiliated with, endorsed by, sponsored by, or associated with Apple Inc. in any way. Apple, iMessage, Messages, HomeKit, Apple Home, HomePod, Mac, and macOS are trademarks of Apple Inc., registered in the U.S. and other countries; all rights to them belong to Apple. Any use of these names is only to describe what this software works with.

I built this on my own time, on my own personal equipment, at my own expense, for my own personal use. It doesn't use, contain, or derive from any confidential information, code, or resources belonging to Apple or any employer. No Apple artwork, icons, or other assets are included.

Provided as-is, with no warranty. Use at your own risk.

# RyHome

A Windows client for Apple Home, styled after the macOS Home app. A small companion server on your Mac does the actual talking to your accessories.

## How it works

Apple doesn't offer a HomeKit API outside its own signed apps, so RyHome uses **Matter** instead. Matter accessories can belong to more than one controller at once, so you add each light to RyHome from the Home app ("Turn On Pairing Mode") and it keeps working in Apple Home exactly as before. RyHome only ever removes its own pairing.

- Lights (on/off, brightness, color, color temperature) are controlled directly over Matter, with live updates when they change anywhere else.
- Names and rooms come from the Home app's local database, read-only, if you grant Full Disk Access.
- HomePod temperature and humidity can come from an optional Shortcut.
- HomeKit-only accessories (not Matter) aren't supported.

## Structure

- `client/` - Windows client. Vite + React + TypeScript, wrapped in Tauri 2 for the native shell.
- `server/` - macOS companion server. Node.js + TypeScript, using [matter.js](https://github.com/project-chip/matter.js) as the Matter controller.
- `docs/` - API contract between the two.

## Setup

1. On the Mac, run `server/install.sh`. It builds the server, sets it to start at login, and prints a pairing code. See `server/README.md`.
2. On Windows, open RyHome and paste the pairing code.
3. Choose **Add Light** from the ••• menu and follow the steps for each light.

Pair one light first and make sure it still behaves normally in the Home app before adding the rest.

Prefer a private network between the two machines, such as Tailscale. If the server advertises the wrong address, set `advertisedHost` or `advertisedURL` in `~/.ryhome/config.json`.

## Development

### Client

```
cd client
npm install
npm run dev
```

Click "Try the Demo" on the welcome screen to use built-in fake accessories so UI work isn't blocked by the Mac. Use the ••• menu to exit.

### Desktop app

Requires Rust (MSVC toolchain) and the Visual Studio C++ Build Tools with a Windows SDK.

```
cd client
npm run tauri dev
```

### Server

```
cd server
npm install
npm run dev
```

The server runs on any OS for API work, but Home app names, Shortcuts, and the installer are macOS only.

## Disclaimer

This is an independent personal project. It is not affiliated with, endorsed by, sponsored by, or associated with Apple Inc. in any way. Apple, iMessage, Messages, HomeKit, Apple Home, HomePod, Mac, and macOS are trademarks of Apple Inc., registered in the U.S. and other countries; all rights to them belong to Apple. Any use of these names is only to describe what this software works with.

I built this on my own time, on my own personal equipment, at my own expense, for my own personal use. It doesn't use, contain, or derive from any confidential information, code, or resources belonging to Apple or any employer. No Apple artwork, icons, or other assets are included.

Provided as-is, with no warranty. Use at your own risk.

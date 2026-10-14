# RyHome Core

The Matter engine behind RyHome. It's a matter.js controller for your lights plus the local API in `../docs/api.md`.

The desktop app runs it automatically, so you normally never start it yourself. `npm run bundle` builds `dist/core.mjs`, a single self-contained file the app ships and runs with its bundled Node.js.

## Running it alone

```
npm install
npm run dev
```

| Variable | Default | Description |
| --- | --- | --- |
| `RYHOME_TOKEN` | random, printed at startup | Bearer token clients must present. |
| `RYHOME_PORT` | `8788` | Listening port. |
| `RYHOME_HOST` | `127.0.0.1` | Listening address. Keep it on localhost unless you know why. |
| `RYHOME_HOME` | `~/.ryhome` | Data folder for pairings, names, and scenes. |
| `RYHOME_MATTER_LOG` | `warn` | matter.js log level. |
| `RYHOME_PARENT_PIPE` | unset | When `1`, exits as soon as stdin closes. The desktop app uses this so the engine never outlives it. |

Once ready it prints `RYHOME_READY {"host":...,"port":...}`.

## Data

- `matter/` - matter.js storage, including RyHome's Matter credentials. Deleting it orphans RyHome's pairings on your lights; remove them from each light's other app afterwards.
- `accessories.json` - names, rooms, and icons.
- `settings.json` - home name and temperature unit.
- `scenes.json` - scenes.

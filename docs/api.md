# RyHome API

The server exposes an authenticated HTTP API for commands and initial data, plus a WebSocket for real-time events. All payloads are JSON.

## Authentication

Every HTTP request requires a bearer token:

```
Authorization: Bearer <token>
```

Unauthenticated requests receive `401`.

Browser WebSocket clients can't set headers, so they send an auth frame first:

```json
{ "type": "auth", "token": "<token>" }
```

The server closes the socket with code `1008` if the first message isn't a valid auth frame or none arrives within 10 seconds. Tokens never go in URLs.

## GET /v1/capabilities

```json
{ "capabilities": { "lights": true, "climate": false, "scenes": true, "pairing": true, "homeKitNames": true } }
```

`climate` is true once the climate shortcut is found. `homeKitNames` is true when the server can read the Home app's database.

## GET /v1/home

```json
{
  "id": "home",
  "name": "My Home",
  "temperatureUnit": "F",
  "rooms": [{ "id": "office", "name": "Office" }],
  "accessories": [
    {
      "id": "matter-1-1",
      "kind": "light",
      "matterNodeId": "1",
      "linked": true,
      "name": "Desk Lamp",
      "roomId": "office",
      "icon": "bulb",
      "reachable": true,
      "supports": { "brightness": true, "color": true, "temperature": true },
      "state": { "on": true, "brightness": 80, "hue": 30, "saturation": 60, "colorTemperature": 370, "colorMode": "temperature" }
    },
    { "id": "climate-office-temperature", "kind": "sensor", "sensor": "temperature", "name": "Temperature", "roomId": "office", "reachable": true, "value": 21.5 }
  ],
  "scenes": [{ "id": "uuid", "name": "Movie", "type": "custom", "actions": [{ "accessoryId": "matter-1-1", "state": { "on": true, "brightness": 20 } }] }]
}
```

Units: `brightness` and `saturation` are 0-100, `hue` is 0-360, `colorTemperature` is in mireds, and temperature sensor values are always Celsius. `temperatureUnit` is only a display preference.

## PATCH /v1/accessories/:id/light

Any subset of the light state. Returns `204`.

```json
{ "on": true, "brightness": 40 }
{ "colorMode": "hs", "hue": 270, "saturation": 75 }
{ "colorMode": "temperature", "colorTemperature": 454 }
```

Setting `brightness` also turns the light on. `on: false` ignores other fields. Unreachable lights return `503 unreachable`.

## Scenes

- `POST /v1/scenes` with `{ "name", "type"?, "actions": [{ "accessoryId", "state" }] }` returns the scene.
- `PUT /v1/scenes/:id` replaces it.
- `DELETE /v1/scenes/:id`
- `POST /v1/scenes/:id/run` applies every action. Returns `204`.

`type` is one of `wakeUp`, `sleep`, `departure`, `arrival`, `custom`.

## Matter pairing

### GET /v1/homekit/accessories

Matter accessories from the Home app, for the "which light is this" picker. Requires Full Disk Access (`503 permission_required` otherwise).

```json
[{ "id": "3a:c2:60:56:f1:9b+1", "name": "Desk Lamp", "room": "Office", "model": "H6008", "linkedNodeId": null }]
```

### POST /v1/matter/commission

```json
{ "code": "3497-011-2332", "homeKitId": "3a:c2:60:56:f1:9b+1" }
```

`code` is the 11 or 21 digit setup code from the Home app's "Turn On Pairing Mode", or an `MT:` QR payload. `homeKitId` is optional. Can take up to a minute. Returns:

```json
{ "nodeId": "1", "accessories": [ ] }
```

Errors: `409 busy` while another pairing runs, `422 pairing_failed` with the reason.

### PUT /v1/matter/nodes/:nodeId/link

`{ "homeKitId": "..." }` links a node to a Home app accessory, or `{ "homeKitId": null }` unlinks it.

### DELETE /v1/matter/nodes/:nodeId

Removes RyHome's own pairing from the device. Other controllers, including Apple Home, are untouched.

## WS /v1/events

```json
{ "type": "accessoryUpdated", "accessory": { } }
{ "type": "homeChanged" }
```

`homeChanged` means rooms, names, scenes, or the set of accessories changed; refetch `GET /v1/home`. Clients may send `{ "type": "ping" }`, which the server ignores.

## Errors

```json
{ "error": { "code": "not_found", "message": "No such light." } }
```

Codes: `unauthorized`, `not_found`, `invalid_request`, `unreachable`, `busy`, `pairing_failed`, `permission_required`, `internal`.

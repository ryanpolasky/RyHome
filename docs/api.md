# RyHome API

The engine exposes an authenticated HTTP API on localhost for commands and data, plus a WebSocket for real-time events. All payloads are JSON.

## Authentication

Every HTTP request requires a bearer token:

```
Authorization: Bearer <token>
```

Unauthenticated requests receive `401`. The desktop app generates a fresh token each launch and passes it to the engine.

Browser WebSocket clients can't set headers, so they send an auth frame first:

```json
{ "type": "auth", "token": "<token>" }
```

The engine closes the socket with code `1008` if the first message isn't a valid auth frame or none arrives within 10 seconds.

## GET /v1/capabilities

```json
{ "capabilities": { "lights": true, "scenes": true, "pairing": true, "rename": true, "groups": true } }
```

## GET /v1/home

```json
{
  "id": "home",
  "name": "Home",
  "temperatureUnit": "F",
  "rooms": [{ "id": "office", "name": "Office" }],
  "accessories": [
    {
      "id": "matter-1-1",
      "kind": "light",
      "matterNodeId": "1",
      "name": "Desk Lamp",
      "roomId": "office",
      "icon": "bulb",
      "reachable": true,
      "supports": { "brightness": true, "color": true, "temperature": true },
      "state": { "on": true, "brightness": 80, "hue": 30, "saturation": 60, "colorTemperature": 370, "colorMode": "temperature" }
    }
  ],
  "scenes": [{ "id": "uuid", "name": "Movie", "type": "custom", "actions": [{ "accessoryId": "matter-1-1", "state": { "on": true, "brightness": 20 } }] }]
}
```

Units: `brightness` and `saturation` are 0-100, `hue` is 0-360, and `colorTemperature` is in mireds. Rooms come from the accessories in them; lights without a room go in "Default Room".

## PATCH /v1/home

`{ "name"?, "temperatureUnit"?: "C" | "F" }`. Returns `204`.

## PATCH /v1/accessories/:id

`{ "name"?, "room"?, "icon"?, "hidden"? }`. Set a field to `null` to go back to the default. Icons: `bulb`, `ceiling`, `floorLamp`, `tableLamp`, `lightstrip`. Returns `204`.

## PATCH /v1/accessories/:id/light

Any subset of the light state. Returns `204`.

```json
{ "on": true, "brightness": 40 }
{ "colorMode": "hs", "hue": 270, "saturation": 75 }
{ "colorMode": "temperature", "colorTemperature": 454 }
```

Setting `brightness` also turns the light on. `on: false` ignores other fields. Unreachable lights return `503 unreachable`.

## Groups

A group shows up in `accessories` as a light with a `members` list of light ids. Its state is combined: on when any member is on, at the average brightness of the members that are on. Members stay in `accessories` with a `groupId` so clients can hide them from the main grid.

- `POST /v1/groups` with `{ "name", "room"?, "icon"?, "members": ["matter-1-1", "matter-2-1"] }` returns the group.
- `PUT /v1/groups/:id` with any of the same fields. Members you leave out are released.
- `DELETE /v1/groups/:id` ungroups. The lights themselves aren't touched.
- `PATCH /v1/accessories/:groupId` renames or moves a group, like any light.
- `PATCH /v1/accessories/:groupId/light` sends the change to every reachable member.

A light belongs to at most one group; adding it to another moves it. A group needs at least two lights.

## Scenes

- `POST /v1/scenes` with `{ "name", "type"?, "actions": [{ "accessoryId", "state" }] }` returns the scene.
- `PUT /v1/scenes/:id` replaces it.
- `DELETE /v1/scenes/:id`
- `POST /v1/scenes/:id/run` applies every action. Returns `204`.

`type` is one of `wakeUp`, `sleep`, `departure`, `arrival`, `custom`.

## Matter pairing

### POST /v1/matter/commission

```json
{ "code": "3497-011-2332", "name": "Desk Lamp", "room": "Office" }
```

`code` is the 11 or 21 digit setup code from another app's pairing mode, or an `MT:` QR payload. `name` and `room` are optional. Can take up to a minute. Returns:

```json
{ "nodeId": "1", "accessories": [ ] }
```

Errors: `409 busy` while another pairing runs, `422 pairing_failed` with the reason.

### DELETE /v1/matter/nodes/:nodeId

Removes RyHome's own pairing from the device and forgets its names. Other controllers are untouched.

## WS /v1/events

```json
{ "type": "accessoryUpdated", "accessory": { } }
{ "type": "homeChanged" }
```

`homeChanged` means rooms, names, scenes, or the set of accessories changed; refetch `GET /v1/home`. Clients may send `{ "type": "ping" }`, which the engine ignores.

## Errors

```json
{ "error": { "code": "not_found", "message": "No such light." } }
```

Codes: `unauthorized`, `not_found`, `invalid_request`, `unreachable`, `busy`, `pairing_failed`, `internal`.

# stream-command-bridge

`stream-command-bridge` is a small, self-hosted TypeScript library that listens for Twitch chat commands and turns them into neutral events that any application can consume. It exists to keep Twitch authentication, chat connectivity, command parsing, permissions, and cooldowns in one reusable bridge instead of coupling those concerns to a specific overlay, bot, or automation.

```json
{
  "command": "openpack",
  "user": "exampleuser",
  "args": []
}
```

## Features

- Device-code authentication with Twitch; no client secret required
- Refresh-token rotation and periodic token validation
- Twitch chat over an EventSub WebSocket connection
- Automatic EventSub reconnection and duplicate-message suppression
- Configurable command prefix with quoted and escaped arguments
- Everyone, subscriber, VIP, moderator, and broadcaster permissions
- Global and per-user command cooldowns
- Typed neutral command, message, ignored, status, and error events
- No required web server or database

## Quick Start

### Prerequisites

- Node.js 20 or newer
- npm
- A Twitch account
- A Twitch developer application and its Client ID
- If listening to another channel, the authorizing Twitch account must moderate that channel

Clone and install the project:

```sh
git clone https://github.com/b3rtopacks/stream-command-bridge.git
cd stream-command-bridge
npm install
```

Copy the environment template:

```sh
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Create an application in the [Twitch Developer Console](https://dev.twitch.tv/console/apps). Choose a public client when that option is available; the device-code flow does not require a client secret. Then place the application's Client ID in `.env`:

```dotenv
TWITCH_CLIENT_ID=your_twitch_client_id
```

`TWITCH_BROADCASTER_LOGIN` is optional. When omitted, the bridge listens to the channel belonging to the account that completes authorization.

Run the included listener:

```sh
npm run example
```

On first run, the example prints a Twitch activation URL and a device code. Open the URL, enter the code, approve access, and leave the example running. Sending `!openpack` in the configured Twitch chat produces a neutral command event in the terminal.

The example stores tokens in `.data/twitch-tokens.json`. This plaintext local-development file is ignored by Git and must be treated like a password.

## Receiving command events

External applications subscribe to the bridge's `command` event. The payload contains no application-specific action or Twitch credential data:

```ts
bridge.on("command", (event) => {
  externalApplication.handleCommand(event);
});
```

For a complete runnable setup, see [`examples/listener.ts`](https://github.com/b3rtopacks/stream-command-bridge/blob/main/examples/listener.ts). Its listener prints:

```json
{"command":"openpack","user":"exampleuser","args":[]}
```

## Architecture

```text
Twitch Chat → EventSub → Command Parser → Permissions/Cooldowns → Neutral Command Event → External App
```

The bridge owns the Twitch-facing and command-policy layers. Your application decides what a validated command means and what action, if any, should follow.

## Command configuration

Commands are configured when creating `StreamCommandBridge`:

```ts
const bridge = new StreamCommandBridge({
  auth,
  prefix: "!",
  commands: {
    openpack: { permission: "everyone", userCooldownMs: 5_000 },
    reset: { permission: "moderator", cooldownMs: 10_000 },
  },
});
```

If `commands` is omitted, every valid prefixed command is emitted. Once at least one command is registered, the registry acts as an allow-list. Commands can also be registered at runtime:

```ts
bridge.commands.register("scene", {
  permission: "vip",
  cooldownMs: 2_000,
  userCooldownMs: 10_000,
});
```

Permission levels are ordered as `everyone < subscriber < vip < moderator < broadcaster`. Cooldowns are expressed in milliseconds and start only after permission checks pass.

The bridge also emits `message`, `ignored`, `status`, `connected`, `disconnected`, and `error` events.

## Authentication and token storage

`TwitchAuth` requests only the `user:read:chat` scope by default. It accepts any implementation of `TokenStore`, so applications can use an OS keychain, secret manager, encrypted database, or another secure store. The included `JsonFileTokenStore` is an opt-in plaintext convenience for local development.

Device-code refresh tokens rotate and may expire after inactivity. Persist every token update through your `TokenStore`; the included stores do this automatically. Repeat device authorization if Twitch rejects a refresh token.

See [SECURITY.md](SECURITY.md) for secret-handling and vulnerability-reporting guidance.

## Why this project?

Streaming workflows often grow into several separate utilities for chat commands, triggers, overlays, and automation. The goal of `stream-command-bridge` is to provide one reusable foundation that external tools can build on while remaining free, open source, and self-hostable—with no ads, paid tier, or subscription model.

## Roadmap

The following areas are planned and are not implemented yet:

- OBS WebSocket integration
- Channel Points events
- Bits events
- Subscription events
- HTTP and WebSocket command outputs
- A simple command-management UI

Roadmap items are directional rather than release commitments. Contributions and design discussion are welcome before implementation begins.

## Development

```sh
npm run typecheck
npm test
npm run build
```

Run all required checks with:

```sh
npm run check
```

## Contributing

Bug reports, documentation improvements, tests, and focused pull requests are welcome. Please keep changes platform-neutral, avoid application-specific business logic, and add tests for behavior changes.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and pull-request checklist. Report security issues privately as described in [SECURITY.md](SECURITY.md), not through a public issue.

## License

Licensed under the [MIT License](LICENSE).

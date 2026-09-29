# Security Policy

## Supported versions

Until the first stable release, security fixes are applied to the latest `0.x` release and the current `main` branch.

## Reporting a vulnerability

Please do not report suspected vulnerabilities in a public issue. Use [GitHub's private security advisory form](https://github.com/b3rtopacks/stream-command-bridge/security/advisories/new) and include:

- The affected version or commit
- Reproduction steps or a proof of concept
- The likely impact
- Any suggested mitigation, if known

Please allow maintainers a reasonable opportunity to investigate and publish a fix before disclosing the issue publicly. Do not access data or accounts that do not belong to you while testing.

## Secret handling

- Never commit `.env`, files under `.data/`, Twitch access tokens, refresh tokens, client secrets, API keys, or private user data.
- Use `.env.example` only for placeholder names and non-secret defaults.
- Treat `.data/twitch-tokens.json` as a password. `JsonFileTokenStore` is intended for local development and stores tokens as plaintext.
- For deployed applications, provide a `TokenStore` backed by an OS keychain, encrypted database, or secret manager.
- Request only the Twitch scopes the application needs. The default is `user:read:chat`.
- Do not log token values or raw authentication responses.

If a secret is committed, immediately revoke or rotate it with its provider. Removing it from the latest commit is not sufficient because it may remain in Git history and existing clones.

## Dependency and release checks

Before release, maintainers should run:

```sh
npm audit
npm run check
npm pack --dry-run
```

Review the staged diff and run a credential scanner before pushing or publishing.

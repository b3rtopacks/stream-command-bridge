# Contributing to stream-command-bridge

Thank you for helping improve `stream-command-bridge`. This is an early open-source project, so focused bug fixes, tests, documentation, and small maintainability improvements are especially useful.

## Before opening an issue

- Search existing issues to avoid duplicates.
- Include the Node.js version, operating system, and relevant error output.
- Describe the expected and actual behavior with the smallest reproducible example you can provide.
- Never include Twitch tokens, `.env` contents, client secrets, or other credentials.

For suspected vulnerabilities or accidentally exposed credentials, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Development setup

```sh
git clone https://github.com/b3rtopacks/stream-command-bridge.git
cd stream-command-bridge
npm install
cp .env.example .env
```

An `.env` file is needed only for manual Twitch testing. Automated tests must not depend on live credentials or network access.

## Making a change

1. Create a focused branch from `main`.
2. Keep the bridge generic and independent of any external application's business logic.
3. Add or update tests for behavior changes.
4. Update documentation when public APIs or setup steps change.
5. Run the complete local check:

```sh
npm run check
npm audit
```

## Pull requests

A pull request should:

- Explain the problem and the chosen solution.
- Stay within one clear concern where practical.
- Pass typechecking, tests, and the production build.
- Avoid unrelated formatting or dependency changes.
- Contain no secrets, generated token files, private data, or proprietary assets.
- Clearly label new integrations or behaviors that remain experimental.

Maintainers may ask for changes before merging. Opening an issue first is encouraged for large features or architectural changes.

## Code style

- Use TypeScript and preserve strict typechecking.
- Prefer small modules with explicit public types.
- Keep emitted command events neutral and application-independent.
- Avoid logging authentication tokens or raw credential-bearing responses.
- Use the existing Node test runner and `tsx` test setup.

By contributing, you agree that your contribution is licensed under the project's [MIT License](LICENSE).

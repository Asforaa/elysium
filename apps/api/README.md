# Elysium API

NestJS backend app for Elysium.

Use Bun only from the monorepo root:

```bash
bun run api:dev
bun run --filter @elysium/api build
bun run --filter @elysium/api test
```

This app will own source-provider adapters, host-provider resolvers, download queue logic, PostgreSQL persistence, and local filesystem/download execution.

No product features are implemented yet.

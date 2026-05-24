# Elysium Web

Client-only React app for Elysium, built with Vite and the TanStack client stack.

Use Bun only from the monorepo root:

```bash
bun run web:dev
bun run --filter @elysium/web build
bun run --filter @elysium/web preview
```

Frontend stack decisions:

- TanStack Query for API/server state.
- TanStack Router when app routing is needed.
- TanStack Table for dense provider, queue, and history views.
- No TanStack Start.

No product features are implemented yet.

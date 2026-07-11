# Better Auth: hook-set User columns MUST be declared in `user.additionalFields`

**last_verified: 2026-07-11**

Better Auth only persists user columns it knows about. Its `create.before` hook
(and any field set inside it) is **stripped from the create payload unless the
field is declared in `user.additionalFields`**. The column then falls back to
its DB default — or, if it is `NOT NULL` with no default, the insert throws
`Argument '<field>' is missing` at `db.user.create()` and **first-time signup
fails**. Existing-user sign-in never calls `user.create`, so the bug is
invisible until a brand-new account is created — which is why it can pass every
local smoke test and still break production onboarding.

## Rule

Any `User` column that a Better Auth hook computes/sets (e.g. `handle`) MUST also
be declared in `user.additionalFields`:

```ts
// apps/server/api/src/auth/better-auth/better-auth.factory.ts
user: {
  fields: { image: 'avatar' },
  additionalFields: {
    handle: { input: false, required: false, type: 'string' },
  },
},
```

- `input: false` — clients can't set it; only the hook can.
- Declaring it makes Better Auth carry the hook's value through to the insert.

## Where

- Config: `apps/server/api/src/auth/better-auth/better-auth.factory.ts`
  (`createBetterAuthInstance`, `user.additionalFields`).
- Regression guard: `better-auth.factory.spec.ts` asserts the source contains
  `additionalFields` with a `handle:` entry.

## History

Root-caused and fixed in **#1576** (handle stripped → `Argument 'handle' is
missing` on new-user signup). Add the same declaration whenever a new
hook-populated column is introduced.

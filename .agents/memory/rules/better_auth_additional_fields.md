# Better Auth: hook-set `User` columns must be declared in `user.additionalFields`

**last_verified: 2026-07-26** · Shipped in #1576

Better Auth strips any field its `create.before` hook sets unless that field is declared in
`user.additionalFields`. The column then falls back to its DB default — or, if it is `NOT NULL`
with no default, `db.user.create()` throws `Argument '<field>' is missing` and **first-time signup
fails**. Sign-in never calls `user.create`, so this passes every local smoke test on an existing
account and breaks production onboarding.

**Rule:** every `User` column a hook computes (e.g. `handle`) must also be declared:

```ts
// apps/server/api/src/auth/better-auth/better-auth.factory.ts
user: {
  fields: { image: 'avatar' },
  additionalFields: {
    handle: { input: false, required: false, type: 'string' }, // input:false — only the hook sets it
  },
},
```

Regression guard: `better-auth.factory.spec.ts` asserts the source contains an `additionalFields`
entry for `handle`. Add the declaration whenever a new hook-populated column appears.

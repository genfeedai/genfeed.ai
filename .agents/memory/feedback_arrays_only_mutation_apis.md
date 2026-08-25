---
name: arrays-only mutation APIs
description: Public mutations take arrays; no singular+plural twins or T | T[] overloads
type: feedback
status: active
last_verified: 2026-08-25
topics: [api, typescript, ui]
---

# Public mutation APIs are arrays only

If the implementation is one collection mutation (a Map, one `setState`, one
close callback), the public API is the array. Do not ship `foo` + `foos`.
Do not ship `T | T[]` overloads. One item wraps as `[item]`.

**Why:** Dual register/unregister on the command palette was leftover surface,
not a design. Union overloads (`cmd | cmd[]`) were the same two APIs with extra
`Array.isArray` at every caller. Vincent rejected both.

**How to apply:**

- Keep `registerCommands(commands[])` / `unregisterCommands(ids[])`.
- Registries: `register(nodes[])`. Pack-level `registerPack` stays — it is a
  different semantic, not a singular twin.
- Gallery `onSelect(items[] | null)`. Upload `onComplete(ingredients[])`.
- Vendor HTTP that is truly 1:1 may stay as a **private** helper. Product and
  controller APIs stay array-only.
- Delete unused singular/plural twins (e.g. dead `generatedAssetIds`).
- Do **not** collapse REST `getFoo` / `getFoos`, Prisma `createMany`, HTTP
  headers, VS Code `registerCommand`, React Hook Form `register`, or append-one
  vs replace-all store actions (`addMessage` / `setMessages`).

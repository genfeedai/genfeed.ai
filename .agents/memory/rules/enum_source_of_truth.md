---
name: enum_source_of_truth
description: Universal enum and assertion invariants; read the linked reference before changing statuses or credential platforms
type: project
last_verified: 2026-09-05
---

# Enum and assertion invariants

- Prisma-backed domain enum values must match the persisted labels exactly.
  String columns and UI filter keys keep their documented product vocabulary;
  do not convert them merely to match an unrelated Prisma enum.
- `ReviewDecision` deliberately has uppercase persistence labels and lowercase
  product/API values (including `unset`). Use `PersistedReviewDecision` for writes
  and `parseReviewDecision` for reads.
- Credential platforms cross the shared `toPrismaCredentialPlatform` /
  `fromPrismaCredentialPlatform` boundary. Keep domain `Platform` lowercase;
  do not hand-roll casing conversions.
- Use enum members for persisted-status comparisons. Never bypass Prisma enum
  or platform types with `as never` / `as any`.
- Production `as any` and `@ts-ignore` are banned. `@ts-expect-error` requires an
  intentional documented type error; `as never` cleanups reduce the existing
  assertion baseline in the same PR.

Before changing enum values, Prisma statuses, credential platforms, or assertion
baselines, read [the full boundary rules, exceptions, and examples](../context/enum-source-of-truth.md).

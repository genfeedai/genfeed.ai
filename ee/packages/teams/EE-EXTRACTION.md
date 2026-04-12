# @genfeedai/ee-teams — Phase C Extraction Plan

Tracking issue: [#87](https://github.com/genfeedai/genfeed.ai/issues/87)

Plan file: `.claude-genfeedai/plans/delegated-churning-sifakis.md` §5.1b

## Status

**Layer 1 — scaffold only.** README-only placeholder.

**Layer 2 — TODO:**

**Audit first, extract second.** Unlike billing/analytics/multi-tenancy, teams may not have dedicated enterprise-only code in the repo today — team membership is partially in OSS core already (org members, roles).

## Layer 2 first sub-task

Before writing any extraction PR, run:

```bash
grep -rln 'Team\|team membership\|enterprise.*team\|ee.*team' apps/server/api/src --include='*.ts' | head -30
grep -rln '@genfeedai/teams\|ee-teams' . | head
```

If the grep finds a meaningful body of team-specific enterprise code that's distinct from OSS member/role management, extract it here. Otherwise **delete this directory** — it's a premature placeholder and Phase C can skip it.

## If real code is found

| Source | Target | Notes |
|---|---|---|
| Team-specific role/permission logic | `src/roles/` | Only if distinct from OSS roles |
| Advanced team invitation flows | `src/invitations/` | Only if distinct from OSS org-member flow |

## Related

- Epic #87 (parent)
- Likely to be the smallest extraction target — or deleted entirely

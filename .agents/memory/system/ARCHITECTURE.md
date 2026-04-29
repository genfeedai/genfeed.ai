# Genfeed.ai Architecture Reference

Primary architecture references for planning/reporting.

## Repo Structure

- **Apps (server):** `apps/server/{api,clips,discord,files,images,mcp,notifications,slack,telegram,videos,voices,workers}`
- **Apps (frontend):** `apps/{app,admin,website,desktop,mobile,extensions}`
- **Packages:** `packages/*` (`@genfeedai/*` scope)
- **Enterprise:** `ee/packages/*` (commercial license)

## Desktop Architecture Boundary

- Desktop is an Electron native shell around the real `apps/app` Next.js
  frontend, not a second product frontend.
- Desktop local/offline mode must not require a cloned/running NestJS API.
- Framework-agnostic generation logic belongs in shared packages. The NestJS API
  calls those helpers for cloud/self-hosted REST behavior; Electron main calls
  the same helpers for desktop IPC behavior.
- Electron main owns local backend actions: PGlite storage, local identity,
  provider settings, generation jobs, files/workspaces, and native integration.
- `apps/app` chooses REST or `window.genfeedDesktop` IPC at the runtime boundary.
  It should not duplicate pages or backend business logic for desktop.

## Key References

- Agent runtime: `./AGENT-RUNTIME.md`
- ADRs: `./architecture/`
- Critical rules: `./critical/`
- Open-source context: `./OPEN-SOURCE-CONTEXT.md`
- Self-hosted guide: `./SELF-HOSTED-GUIDE.md`

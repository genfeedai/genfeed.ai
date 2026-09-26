packages: @genfeedai/utils

Move `getErrorStatus`, `isAxiosError`, `IJsonApiError`, and `IApiErrorResponse`
out of `packages/utils/error/error-handler.util.ts` into a new, dependency-free
`packages/utils/error/json-api-status.util.ts`. `error-handler.util.ts` no
longer re-exports them (no backward-compatibility wrapper, per repo
convention) — `ErrorHandler`, `getErrorMessage`, `hasErrorDetail`, `IApiError`,
and `IAxiosLikeError` are unaffected and stay exported from
`error-handler.util.ts` as before.

Import path change for consumers:

```diff
-import { getErrorStatus, isAxiosError } from '@genfeedai/utils/error/error-handler.util';
+import { getErrorStatus, isAxiosError } from '@genfeedai/utils/error/json-api-status.util';
```

Every in-repo caller (apps/app, packages/ui, packages/agent, packages/pages,
packages/services/ai, packages/services/editor) was updated in the same PR.
Root cause: `error-handler.util.ts` imports `@genfeedai/services/core/logger.service`
and `.../notifications.service` (frontend-only) at module scope; a backend
spec (`apps/server/api`) that only needed the pure status-resolution helpers
could not resolve those imports (TS2307). The new module has a single
dependency (`axios` types).

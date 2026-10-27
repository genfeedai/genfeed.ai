# @genfeedai/contracts

Shared contracts for Genfeed enums, constants, interfaces, API types, queues, and desktop IPC.
Every app and package in the monorepo depends on it, so it holds types and constants only.

## Import rule

The root export (`@genfeedai/contracts`) re-exports only two folders: `analytics` and `enums`.
Every other folder is reached through its own subpath export in `package.json`.

```ts
import { ActivityKey } from '@genfeedai/contracts'; // root: enums and analytics only
import type { IActivityPopulated } from '@genfeedai/contracts/interfaces';
import { WORKFLOW_EXECUTION_QUEUE } from '@genfeedai/contracts/queue';
```

Enums are the import almost every file needs, and the analytics helpers are small, so both
stay on the root. The other folders are large and are imported by fewer files. Keeping them
off the root barrel stops every consumer from loading all of them, and keeps the root's
public surface small. When you add a folder, add a subpath export for it. Add it to the
root only when nearly every consumer needs it.

## Directory map

Every folder under `src/`:

| Folder | Import path | Contents |
|---|---|---|
| `analytics/` | `@genfeedai/contracts` (root) | Account evaluation, metric availability, and period metric helpers |
| `enums/` | `@genfeedai/contracts` (root), `/enums`, `/enums/*` | Shared enums and catalogs, such as `ActivityKey` and the activity message catalog |
| `constants/` | `/constants`, `/constants/*` | Shared constants, such as agent chat models, ad presets, and account generation settings |
| `interfaces/` | `/interfaces`, `/interfaces/*` | Shared TypeScript interfaces, grouped by domain (`admin`, `ai`, `auth`, `billing`, and more) |
| `types/` | `/types`, `/types/*`, plus `/types/comfyui`, `/types/nodes`, `/types/replicate`, `/types/workflow` | Workflow, execution, cost, and provider-specific types |
| `api-types/` | `/api-types`, `/api-types/contracts`, `/api-types/*` | API request and response types, including the generated OpenAPI types |
| `queue/` | `/queue`, `/queue/*` | Queue names, file queue constants, dispatch interfaces, and job data shapes |
| `desktop/` | `/desktop` | Desktop IPC contracts shared by the app and the Electron shell |

`package.json` `exports` is the source of truth for the exact subpaths. If this table and
`exports` disagree, `exports` wins.

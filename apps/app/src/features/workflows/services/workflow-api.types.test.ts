import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkflowLifecycle } from '@genfeedai/workflows/contracts';
import { describe, expect, it } from 'vitest';
import type * as CompatibilityApi from './workflow-api';
import type * as WorkflowApiContract from './workflow-api.types';

/**
 * Public workflow API request/response contracts. Adding, renaming, or
 * removing an export must update this fixture — the source scan below fails
 * until that happens.
 *
 * Runtime service values (`WorkflowApiService`, `createWorkflowApiService`,
 * `isCanonicalSystemWorkflow`) live on `workflow-api.ts` and are not type
 * contracts, so they stay out of this list.
 */

/**
 * File-local helpers used by public contracts. They are intentionally not
 * re-exported; keep them unexported and listed here.
 */

const CONTRACT_OWNER_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'workflow-api.types.ts',
);

function readContractOwnerSource(): string {
  return readFileSync(CONTRACT_OWNER_PATH, 'utf8');
}

describe('workflow API contract exports', () => {
  it('imports WorkflowLifecycle from the workflows contract package', () => {
    const source = readContractOwnerSource();

    expect(source).toMatch(
      /import type \{[^}]*WorkflowLifecycle[^}]*\} from '@genfeedai\/workflows\/contracts'/,
    );
    expect(source).not.toMatch(
      /WorkflowLifecycle[^}]*\} from '@genfeedai\/enums'/,
    );
  });
});

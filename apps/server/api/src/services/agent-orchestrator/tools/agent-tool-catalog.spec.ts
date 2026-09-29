import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CURATED_ACTION_CATALOG,
  getToolsForSurface,
  isActionOnSurface,
} from '@genfeedai/actions';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXECUTOR_PATH = resolve(HERE, 'agent-tool-executor.service.ts');
const WORK_OBJECT_HANDLER_PATH = resolve(HERE, 'agent-work-object.service.ts');
const INSTAGRAM_HANDLER_PATH = resolve(
  HERE,
  'agent-instagram-inspiration-tool-handler.service.ts',
);
const X_ACTIONS_HANDLER_PATH = resolve(
  HERE,
  'agent-x-actions-tool-handler.service.ts',
);

describe('curated Agent action catalog', () => {
  it('lists exactly the actions reviewed for Agent', () => {
    const expected = CURATED_ACTION_CATALOG.filter((entry) =>
      isActionOnSurface(entry, 'agent'),
    ).map((entry) => entry.name);
    const actual = getToolsForSurface('agent').map((tool) => tool.name);

    expect(actual).toEqual(expected);
  });
});

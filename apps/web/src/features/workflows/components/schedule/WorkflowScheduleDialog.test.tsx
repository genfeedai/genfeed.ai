import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dialogSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'WorkflowScheduleDialog.tsx'),
  'utf8',
);

describe('WorkflowScheduleDialog', () => {
  it('reads the custom schedule placeholder from the schedule catalog', async () => {
    const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
    const translate = translateFromCatalog(
      'common.automation.workflows.schedule',
    );

    expect(dialogSource).toContain(
      "placeholder={translate('custom.placeholder')}",
    );
    expect(translate('custom.placeholder')).toBe(
      'e.g. weekdays at 9am → 0 9 * * 1-5',
    );
  });
});

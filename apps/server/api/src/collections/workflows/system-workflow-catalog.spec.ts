import {
  getSystemWorkflowCatalogEntry,
  listInstallableSystemWorkflowCatalog,
  listSystemWorkflowCatalog,
} from '@api/collections/workflows/system-workflow-catalog';
import { describe, expect, it } from 'vitest';

describe('system workflow catalog', () => {
  it('lists installable product templates and non-installable system actions', () => {
    const catalog = listSystemWorkflowCatalog();
    const installable = listInstallableSystemWorkflowCatalog();

    expect(catalog.length).toBeGreaterThan(installable.length);
    expect(
      catalog.some((entry) => entry.canonicalId === 'daily-trends-digest'),
    ).toBe(true);
    expect(
      installable.some((entry) => entry.canonicalId === 'daily-trends-digest'),
    ).toBe(true);
    expect(catalog.some((entry) => entry.family === 'system-action')).toBe(
      true,
    );
    expect(installable.some((entry) => entry.family === 'system-action')).toBe(
      false,
    );
  });

  it('returns a catalog entry by canonical id', () => {
    const entry = getSystemWorkflowCatalogEntry('daily-trends-digest');

    expect(entry).toMatchObject({
      canonicalId: 'daily-trends-digest',
      installable: true,
      label: 'Daily Trends Digest',
      schedule: '0 7 * * *',
    });
    expect(getSystemWorkflowCatalogEntry('does-not-exist')).toBeNull();
  });

  it('lists the content loop autopilot workflow as an installable, schedule-enabled entry (#3018)', () => {
    const entry = getSystemWorkflowCatalogEntry('content-loop-autopilot');

    expect(entry).toMatchObject({
      canonicalId: 'content-loop-autopilot',
      family: 'content-loop-autopilot',
      installable: true,
      isScheduleEnabled: true,
      schedule: '0 8 * * *',
      sourceIssue: 3018,
    });
    expect(
      listInstallableSystemWorkflowCatalog().some(
        (item) => item.canonicalId === 'content-loop-autopilot',
      ),
    ).toBe(true);
  });

  it('uses stable canonical ids without duplicates', () => {
    const ids = listSystemWorkflowCatalog().map((entry) => entry.canonicalId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

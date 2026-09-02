import {
  getSystemWorkflowCatalogEntry,
  listInstallableSystemWorkflowCatalog,
  listSystemWorkflowCatalog,
} from '@api/collections/workflows/system-workflow-catalog';
import { describe, expect, it } from 'vitest';

describe('system workflow catalog', () => {
  it('publishes only installable product templates', () => {
    // The action-graph hard cut removed the `system-action` catalog family:
    // product system actions are action nodes created on demand, never
    // catalog rows. Every published entry is therefore user-installable.
    const catalog = listSystemWorkflowCatalog();
    const installable = listInstallableSystemWorkflowCatalog();

    expect(catalog.length).toBeGreaterThan(0);
    expect(installable.length).toBe(catalog.length);
    expect(
      catalog.some((entry) => entry.canonicalId === 'daily-trends-digest'),
    ).toBe(true);
    expect(catalog.some((entry) => entry.family === 'system-action')).toBe(
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

  it('lists outreach campaign dispatch as an installable, schedule-enabled entry (#3407)', () => {
    const entry = getSystemWorkflowCatalogEntry('outreach-campaign-dispatch');

    expect(entry).toMatchObject({
      canonicalId: 'outreach-campaign-dispatch',
      family: 'outreach-campaign-dispatch',
      installable: true,
      isScheduleEnabled: true,
      schedule: '*/1 * * * *',
      sourceIssue: 3407,
    });
    expect(entry?.nodes.map((node) => node.type)).toEqual([
      'genfeedAction',
      'genfeedAction',
      'genfeedAction',
      'genfeedAction',
    ]);
    expect(
      listInstallableSystemWorkflowCatalog().some(
        (item) => item.canonicalId === 'outreach-campaign-dispatch',
      ),
    ).toBe(true);
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

  it('lists competitor ad research as an installable, schedule-enabled entry (#3537)', () => {
    const entry = getSystemWorkflowCatalogEntry(
      'paid-creative-research-ingestion',
    );

    expect(entry).toMatchObject({
      canonicalId: 'paid-creative-research-ingestion',
      family: 'paid-creative-research',
      installable: true,
      isScheduleEnabled: true,
      schedule: '0 6 * * *',
      sourceIssue: 3537,
    });
    expect(
      listInstallableSystemWorkflowCatalog().some(
        (item) => item.canonicalId === 'paid-creative-research-ingestion',
      ),
    ).toBe(true);
  });

  it('retires the X-only ingestion canonical id (#3537)', () => {
    expect(
      getSystemWorkflowCatalogEntry('x-ads-inspiration-ingestion'),
    ).toBeNull();
  });

  it('uses stable canonical ids without duplicates', () => {
    const ids = listSystemWorkflowCatalog().map((entry) => entry.canonicalId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

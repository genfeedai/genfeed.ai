import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  batchCollectionHeaderTabs,
  isBatchHistoryPath,
} from './batch-collection-tabs';

describe('batchCollectionHeaderTabs', () => {
  it('points New at /studio/batch/new and History at /studio/batch/history', () => {
    const tabs = batchCollectionHeaderTabs((path) => `/acme/moonrise${path}`);

    expect(tabs.tabs).toEqual([
      {
        href: '/acme/moonrise/studio/batch/new',
        id: 'new',
        label: 'New',
        matchMode: 'exact',
        matchPaths: [
          '/acme/moonrise/studio/batch',
          '/acme/moonrise/studio/batch/new',
        ],
      },
      {
        href: '/acme/moonrise/studio/batch/history',
        id: 'history',
        label: 'History',
        matchMode: 'prefix',
      },
    ]);
  });

  it('treats only the history route as the history surface', () => {
    expect(isBatchHistoryPath('/acme/moonrise/studio/batch')).toBe(false);
    expect(isBatchHistoryPath('/acme/moonrise/studio/batch/new')).toBe(false);
    expect(isBatchHistoryPath('/acme/moonrise/studio/batch/history')).toBe(
      true,
    );
  });

  it('keeps execution history off the composer source', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'src/features/workflows/pages/batch/BatchComposer.tsx',
      ),
      'utf8',
    );

    expect(source).not.toContain('Recent executions');
    expect(source).not.toContain('onOpenRecentExecution');
  });
});

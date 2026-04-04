import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONSOLIDATION_CANDIDATES,
  ORPHAN_COLLECTIONS,
  renderCollectionNormalizationAudit,
} from '../../../scripts/migrations/collection-normalization-audit';

describe('collection-normalization-audit', () => {
  it('renders the checked-in audit report', () => {
    const rendered = renderCollectionNormalizationAudit();
    const current = readFileSync(
      resolve(
        process.cwd(),
        'scripts/migrations/collection-normalization-audit.md',
      ),
      'utf8',
    );

    expect(rendered).toBe(current);
  });

  it('keeps the orphan inventory stable', () => {
    expect(ORPHAN_COLLECTIONS.map((item) => item.collection)).toEqual([
      'community-threads',
      'knowledge-bases',
      'remote-studio-compositions',
    ]);
  });

  it('keeps the consolidation candidates stable', () => {
    expect(CONSOLIDATION_CANDIDATES.map((item) => item.title)).toEqual([
      'org-integrations vs credentials',
      'cloud.tasks vs crm-tasks',
      'Legacy split leftovers in cloud',
    ]);
  });
});

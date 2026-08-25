import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GENERATION_BRIEF_ENTRY_EXEMPTIONS,
  GENERATION_BRIEF_GENERATIVE_ENTRY_POINTS,
} from '@api/services/generation-brief/generation-brief-entry-points';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../../',
);

describe('generation brief entry points (#3469)', () => {
  it('requires every generative entry to call the shared brief pipeline', () => {
    expect(GENERATION_BRIEF_GENERATIVE_ENTRY_POINTS.length).toBeGreaterThan(0);

    for (const entry of GENERATION_BRIEF_GENERATIVE_ENTRY_POINTS) {
      const source = readFileSync(join(REPO_ROOT, entry.source), 'utf8');
      expect(source, entry.id).toContain(entry.marker);
      expect(source, entry.id).toContain(entry.surface);
    }
  });

  it('registers an explicit exemption for every non-generative media executor', () => {
    expect(GENERATION_BRIEF_ENTRY_EXEMPTIONS.length).toBeGreaterThan(0);

    for (const entry of GENERATION_BRIEF_ENTRY_EXEMPTIONS) {
      const source = readFileSync(join(REPO_ROOT, entry.source), 'utf8');
      expect(source, entry.id).toContain(entry.id.replace('workflow-', ''));
      expect(entry.reason).toBe('non_generative_transform');
    }
  });
});

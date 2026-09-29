import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = import.meta.dirname;

function collectProductionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectProductionSources(path);
    }
    if (!/\.(?:ts|tsx)$/u.test(entry.name)) return [];
    if (/\.(?:spec|test|stories)\.(?:ts|tsx)$/u.test(entry.name)) return [];
    return [path];
  });
}

describe('agent semantic theme contract', () => {
  it('does not advertise an environment with an unlabeled colored dot', () => {
    const source = readFileSync(
      join(SOURCE_ROOT, 'components/AgentTerminalHeader.tsx'),
      'utf8',
    );

    expect(source).not.toContain(
      "'inline-flex size-1.5 shrink-0 rounded-full'",
    );
    expect(source).toContain('{catalog.environmentLabel}');
  });

  it('uses the value-swap affordance on the runtime selector', () => {
    const source = readFileSync(
      join(SOURCE_ROOT, 'components/AgentRuntimeSelector.tsx'),
      'utf8',
    );

    expect(source).toContain('ChevronsUpDown');
    expect(source).not.toContain('ChevronDown');
  });

  it.each([
    'components/AgentChatMessage.tsx',
    'components/AnalyticsSnapshotCard.tsx',
    'workflow/components/ApproachCard.tsx',
    'workflow/components/QuestionCard.tsx',
  ])('uses the shared Card for the semantic card surface in %s', (path) => {
    const source = readFileSync(join(SOURCE_ROOT, path), 'utf8');

    expect(source).toContain("import Card from '@ui/card/Card'");
    expect(source).toContain('<Card');
  });
});

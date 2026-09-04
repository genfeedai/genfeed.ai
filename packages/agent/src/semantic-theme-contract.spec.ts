import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = import.meta.dirname;
const RAW_CHROME_PATTERN =
  /\b(?:text-white|bg-black|bg-white|text-black)(?:\/(?:\d+|\[[^\]]+\]))?\b/u;
const RAW_DARK_PALETTE_PATTERN =
  /\bdark:(?:bg|text|border)-(?:slate|zinc|gray|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/u;
const CONTENT_COLOR_ALLOW_MARKER = 'design-system-allow-content-color';

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

function findViolations(pattern: RegExp): string[] {
  return collectProductionSources(SOURCE_ROOT).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, index) => {
        if (line.includes(CONTENT_COLOR_ALLOW_MARKER)) return [];
        return pattern.test(line)
          ? [`${relative(SOURCE_ROOT, file)}:${index + 1}: ${line.trim()}`]
          : [];
      }),
  );
}

describe('agent semantic theme contract', () => {
  it('keeps application chrome on semantic theme tokens', () => {
    expect(findViolations(RAW_CHROME_PATTERN)).toEqual([]);
  });

  it('does not define a second dark theme with raw neutral hues', () => {
    expect(findViolations(RAW_DARK_PALETTE_PATTERN)).toEqual([]);
  });

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

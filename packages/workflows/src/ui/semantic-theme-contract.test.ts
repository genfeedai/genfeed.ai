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

describe('workflow UI semantic theme contract', () => {
  it('keeps application chrome on semantic theme tokens', () => {
    expect(findViolations(RAW_CHROME_PATTERN)).toEqual([]);
  });

  it('does not define a second dark theme with raw neutral hues', () => {
    expect(findViolations(RAW_DARK_PALETTE_PATTERN)).toEqual([]);
  });

  it('renders the running cost state with a canonical icon and label', () => {
    const source = readFileSync(
      join(SOURCE_ROOT, 'toolbar/CostIndicator.tsx'),
      'utf8',
    );

    expect(source).toContain('statusIcon.running');
    expect(source).toContain('Running');
    expect(source).not.toContain('size-1.5 rounded-full bg-success');
  });

  it('uses shared primitives instead of a workflow design system', () => {
    const forbidden =
      /(?:from\s*|import\s*\()['"](?:@radix-ui\/react-(?:checkbox|label|select|slider|slot)|(?:\.\.?\/)+ui\/(?:button|button\.variants|input|textarea|checkbox|label|select|slider))['"]/u;
    const violations = collectProductionSources(SOURCE_ROOT).filter((file) =>
      forbidden.test(readFileSync(file, 'utf8')),
    );
    expect(violations.map((file) => relative(SOURCE_ROOT, file))).toEqual([]);
    expect(
      readdirSync(join(SOURCE_ROOT, 'ui')).filter((file) =>
        /^(button(?:\.variants)?|input|textarea|checkbox|label|select|slider)\.tsx?$/.test(
          file,
        ),
      ),
    ).toEqual([]);
  });
});

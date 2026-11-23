import { describe, expect, it } from 'vitest';
import {
  parseSourceFile,
  scriptKindFor,
} from '../../architecture/parse-source-file';
import area from './areas/platform-picker';
import type { HandBuiltSource } from './core';

function rulesFor(text: string, file = 'apps/web/src/Sample.tsx'): string[] {
  const source: HandBuiltSource = {
    file,
    sourceFile: parseSourceFile(file, text, scriptKindFor(file)),
    text,
  };
  return area.scan(source).map((finding) => finding.rule);
}

const wrap = (element: string) =>
  `export default function A(){return ${element};}`;

describe('platform-picker guard', () => {
  it.each([
    `<SegmentedControl ariaLabel="x" options={PLATFORM_OPTIONS.map((p) => ({ label: p.label, value: p.id }))} />`,
    `<OptionTileGroup ariaLabel="x" options={platforms.map((platform) => ({ label: platform, value: platform }))} />`,
    `<Select ariaLabel="x" options={accounts.map((a) => ({ label: a.handle, value: a.id }))} />`,
  ])('blocks a text-only list of platforms or accounts: %s', (element) => {
    expect(rulesFor(wrap(element))).toEqual(['platform-picker-text']);
  });

  it('follows an options constant declared in the file', () => {
    expect(
      rulesFor(
        `const options = platforms.map((p) => ({ label: p, value: p }));\n${wrap('<SegmentedControl ariaLabel="x" options={options} />')}`,
      ),
    ).toEqual(['platform-picker-text']);
  });

  it.each([
    `<SegmentedControl ariaLabel="x" options={platforms.map((p) => ({ icon: <PlatformIcon platform={p} />, label: p, value: p }))} />`,
    `<Select ariaLabel="x" options={accounts.map((a) => ({ avatar: a.avatar, label: a.handle, value: a.id }))} />`,
    `<SegmentedControl ariaLabel="x" options={[{ label: 'Social', value: 'social' }]} />`,
    `<SegmentedControl ariaLabel="x" options={sortOptions} />`,
  ])('lets options with an icon or other lists through: %s', (element) => {
    expect(rulesFor(wrap(element))).toEqual([]);
  });

  it('skips the shared package and honours the escape hatch', () => {
    const element = `<SegmentedControl ariaLabel="x" options={platforms.map((p) => ({ label: p, value: p }))} />`;
    expect(
      rulesFor(wrap(element), 'packages/ui/src/components/Sample.tsx'),
    ).toEqual([]);
    expect(
      rulesFor(
        wrap(
          `(\n// ui-guard-allow:platform-picker-text -- a metric per platform\n${element}\n)`,
        ),
      ),
    ).toEqual([]);
  });
});

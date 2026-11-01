import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import badgeAlert from './hand-built/areas/badge-alert';
import selectionControls from './hand-built/areas/selection-controls';
import {
  buildBaseline,
  diffBaseline,
  type HandBuiltFinding,
  type HandBuiltSource,
} from './hand-built/core';
import { utilityOf } from './hand-built/restyle';

function sourceOf(file: string, text: string): HandBuiltSource {
  return {
    file,
    sourceFile: ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
    text,
  };
}

const BADGE_IMPORT = "import { Badge } from '@ui/primitives/badge';\n";
const ALERT_IMPORT = "import { Alert } from '@ui/primitives/alert';\n";

function scan(text: string, file = 'apps/web/src/Example.tsx') {
  return badgeAlert
    .scan(sourceOf(file, text))
    .map((finding) => `${finding.rule}:${finding.line}`);
}

describe('badge and alert restyle guard', () => {
  it.each([
    ['padding', 'px-3 py-1', ['badge-restyle:2']],
    ['shape', 'rounded-full', ['badge-restyle:2']],
    ['colour', 'bg-red-500 text-white', ['badge-restyle:2']],
    ['typography', 'text-xs uppercase', ['badge-restyle:2']],
    ['variant-prefixed', 'md:px-4 hover:bg-primary', ['badge-restyle:2']],
    ['arbitrary variant', '[&>svg]:rounded-sm', ['badge-restyle:2']],
    ['fixed height', 'h-7', ['badge-restyle:2']],
  ])('flags a Badge restyled by %s', (_name, classes, expected) => {
    expect(
      scan(
        `${BADGE_IMPORT}export const A = () => <Badge className="${classes}" />;\n`,
      ),
    ).toEqual(expected);
  });

  it.each([
    'w-full',
    'mt-2 ml-auto',
    'shrink-0 grow',
    'absolute right-2 top-2 z-10',
    'self-start cursor-pointer',
    'text-center',
    'md:w-1/2 hover:cursor-pointer',
  ])('allows layout-only classes on a Badge: %s', (classes) => {
    expect(
      scan(
        `${BADGE_IMPORT}export const A = () => <Badge className="${classes}" />;\n`,
      ),
    ).toEqual([]);
  });

  it('sees classes inside cn(), conditionals, templates and local constants', () => {
    const text = `${BADGE_IMPORT}const TONE = 'bg-muted';
export const A = ({ x }: { x: boolean }) => (
  <div>
    <Badge className={cn('w-full', x && 'rounded-full')} />
    <Badge className={\`mt-2 \${x ? 'px-2' : ''}\`} />
    <Badge className={TONE} />
  </div>
);
`;
    expect(scan(text)).toEqual([
      'badge-restyle:5',
      'badge-restyle:6',
      'badge-restyle:7',
    ]);
  });

  it('flags a restyled Alert but not a plain one', () => {
    const text = `${ALERT_IMPORT}export const A = () => (
  <>
    <Alert variant="info" className="mt-4" />
    <Alert variant="info" className="p-0 bg-transparent" />
  </>
);
`;
    expect(scan(text)).toEqual(['alert-restyle:5']);
  });

  it('honours ui-guard-allow with a reason, and only with a reason', () => {
    const text = `${BADGE_IMPORT}export const A = () => (
  <>
    {/* ui-guard-allow:badge-restyle -- member-chosen tag colour */}
    <Badge className="bg-red-500" />
    {/* ui-guard-allow:badge-restyle */}
    <Badge className="bg-red-500" />
  </>
);
`;
    expect(scan(text)).toEqual(['badge-restyle:7']);
  });

  it('is not silenced by the design-system content-colour comment', () => {
    const text = `${BADGE_IMPORT}export const A = () => (
  <Badge className={'bg-black/70' /* design-system-allow-content-color */} />
);
`;
    expect(scan(text)).toEqual(['badge-restyle:3']);
  });

  it('ignores a Badge that is not the shared one, and the shared package itself', () => {
    expect(
      scan(
        'import { Badge } from \'./local\';\nexport const A = () => <Badge className="bg-red-500" />;\n',
      ),
    ).toEqual([]);
    expect(
      scan(
        `${BADGE_IMPORT}export const A = () => <Badge className="bg-red-500" />;\n`,
        'packages/ui/src/components/Example.tsx',
      ),
    ).toEqual([]);
  });

  it.each([
    ['md:px-4', 'px-4'],
    ['hover:bg-primary', 'bg-primary'],
    ['[&>svg]:size-4', 'size-4'],
    ['!rounded-none', 'rounded-none'],
    ['dark:md:text-xs', 'text-xs'],
  ])('strips variant prefixes from %s', (token, expected) => {
    expect(utilityOf(token)).toBe(expected);
  });
});

describe('shrink-only baseline', () => {
  const finding = (file: string, rule: string): HandBuiltFinding => ({
    detail: '',
    file,
    line: 1,
    rule,
  });

  it('counts findings per file and rule', () => {
    expect(
      buildBaseline([
        finding('b.tsx', 'badge-restyle'),
        finding('a.tsx', 'badge-restyle'),
        finding('a.tsx', 'badge-restyle'),
      ]).files,
    ).toEqual({
      'a.tsx': { 'badge-restyle': 2 },
      'b.tsx': { 'badge-restyle': 1 },
    });
  });

  it('reports growth as a regression and a cleanup as stale', () => {
    const baseline = buildBaseline([
      finding('a.tsx', 'badge-restyle'),
      finding('b.tsx', 'badge-restyle'),
    ]);
    const actual = buildBaseline([
      finding('a.tsx', 'badge-restyle'),
      finding('a.tsx', 'badge-restyle'),
    ]);

    expect(diffBaseline(baseline, actual)).toEqual({
      regressions: [
        { actual: 2, baseline: 1, file: 'a.tsx', rule: 'badge-restyle' },
      ],
      stale: [{ actual: 0, baseline: 1, file: 'b.tsx', rule: 'badge-restyle' }],
    });
  });
});

function scanSelection(text: string, file = 'apps/web/src/Example.tsx') {
  return selectionControls
    .scan(sourceOf(file, text))
    .map((finding) => `${finding.rule}:${finding.line}`);
}

const BUTTON_IMPORT = "import { Button } from '@ui/primitives/button';\n";
const SEGMENTED_IMPORT =
  "import { SegmentedControl } from '@ui/primitives/segmented-control';\n";

describe('selection controls guard', () => {
  it.each([
    ['an equality check', 'mode === option'],
    ['an includes check', 'goals.includes(goal)'],
    ['a selected flag', 'isSelected'],
    ['an active flag', 'isActive'],
  ])('flags a Button whose variant flips on %s', (_name, condition) => {
    expect(
      scanSelection(
        `${BUTTON_IMPORT}export const A = () => <Button variant={${condition} ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY} />;\n`,
      ),
    ).toEqual(['selection-button:2']);
  });

  it.each([
    [
      'a destructive swap',
      'isError ? ButtonVariant.DESTRUCTIVE : ButtonVariant.DEFAULT',
    ],
    ['a static variant', 'ButtonVariant.GHOST'],
    [
      'a non-selection flag',
      'canGenerate ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY',
    ],
  ])('allows a Button with %s', (_name, variant) => {
    expect(
      scanSelection(
        `${BUTTON_IMPORT}export const A = () => <Button variant={${variant}} />;\n`,
      ),
    ).toEqual([]);
  });

  it('flags an UNSTYLED Button that paints a selected tile', () => {
    const text = `${BUTTON_IMPORT}export const A = ({ on }: { on: boolean }) => (
  <Button
    variant={ButtonVariant.UNSTYLED}
    className={\`rounded-lg border p-4 \${on ? 'border-primary bg-primary/10' : 'border-border'}\`}
  />
);
`;
    expect(scanSelection(text)).toEqual(['selection-tile:3']);
  });

  it('does not flag a left-edge selection marker on a list row', () => {
    const text = `${BUTTON_IMPORT}export const A = ({ on }: { on: boolean }) => (
  <Button
    variant={ButtonVariant.UNSTYLED}
    className={on ? 'bg-primary/10 border-l-2 border-primary' : ''}
  />
);
`;
    expect(scanSelection(text)).toEqual([]);
  });

  it('honours ui-guard-allow with a reason for a Button', () => {
    const text = `${BUTTON_IMPORT}export const A = ({ on }: { on: boolean }) => (
  <>
    {/* ui-guard-allow:selection-button -- primary call to action */}
    <Button variant={on === true ? ButtonVariant.DEFAULT : ButtonVariant.GHOST} />
  </>
);
`;
    expect(scanSelection(text)).toEqual([]);
  });

  it('flags a restyled SegmentedControl but allows layout classes', () => {
    const text = `${SEGMENTED_IMPORT}export const A = () => (
  <>
    <SegmentedControl className="mb-4 w-full" />
    <SegmentedControl className="rounded-full px-3" />
  </>
);
`;
    expect(scanSelection(text)).toEqual(['segmented-restyle:5']);
  });
});

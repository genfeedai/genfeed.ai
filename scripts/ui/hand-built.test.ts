import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import badgeArea from './hand-built/areas/badge';
import alertArea from './hand-built/areas/badge-alert';
import buttons from './hand-built/areas/buttons';
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
  return [
    ...badgeArea.scan(sourceOf(file, text)),
    ...alertArea.scan(sourceOf(file, text)),
  ].map((finding) => `${finding.rule}:${finding.line}`);
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

describe('hand-built badge guard', () => {
  it.each([
    [
      'a rounded-full pill span',
      '<span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium" />',
    ],
    [
      'a media overlay chip',
      '<div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-2xs text-white" />',
    ],
    [
      'a bordered mono tag',
      '<span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs" />',
    ],
    [
      'a pill whose tone is a template value',
      '<span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs ${tone}`} />',
    ],
    [
      'a count dot with a fixed height',
      '<span className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full px-1 text-2xs" />',
    ],
  ])('flags %s', (_name, element) => {
    expect(scan(`export const A = () => ${element};\n`)).toEqual([
      'badge-hand-built:1',
    ]);
  });

  it.each([
    [
      'a block-level alert box',
      '<div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs" />',
    ],
    [
      'padding without small text',
      '<span className="rounded-md bg-muted px-3 py-2 text-sm" />',
    ],
    [
      'layout only',
      '<span className="absolute right-2 top-2 flex items-center" />',
    ],
    ['text with no shape', '<span className="px-2 py-0.5 text-xs" />'],
  ])('allows %s', (_name, element) => {
    expect(scan(`export const A = () => ${element};\n`)).toEqual([]);
  });

  it('flags a tone read from a lookup, which the literal scan cannot see', () => {
    const text = `${BADGE_IMPORT}export const A = ({ status }: { status: { color: string } }) => (
  <>
    <Badge className={status.color} />
    <Badge className={getToneClass(1)} />
    <Badge className={className} />
  </>
);
`;
    expect(scan(text)).toEqual(['badge-restyle:4', 'badge-restyle:5']);
  });

  it('knows the workspace import path for Badge', () => {
    expect(
      scan(
        'import { Badge } from \'@genfeedai/ui/primitives/badge\';\nexport const A = () => <Badge className="px-3" />;\n',
      ),
    ).toEqual(['badge-restyle:2']);
  });

  it('is silenced only by ui-guard-allow with a reason', () => {
    const text =
      '// ui-guard-allow:badge-hand-built -- member-chosen colour\nexport const A = () => <span className="rounded-full px-2 py-0.5 text-xs" />;\n';
    expect(scan(text)).toEqual([]);
  });

  it('does not scan the shared package that defines the badge', () => {
    expect(
      scan(
        'export const A = () => <span className="rounded-full px-2 py-0.5 text-xs" />;\n',
        'packages/ui/src/primitives/badge.tsx',
      ),
    ).toEqual([]);
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

function scanButtons(text: string, file = 'apps/web/src/Example.tsx') {
  return buttons
    .scan(sourceOf(file, text))
    .map((finding) => `${finding.rule}:${finding.line}`);
}

describe('buttons guard', () => {
  it.each([
    ['a surface', 'bg-black/50 hover:bg-black/70'],
    ['a border and radius', 'rounded-md border border-border'],
    ['a text colour', 'text-destructive'],
  ])('flags a shared-variant Button restyled with %s', (_name, classes) => {
    expect(
      scanButtons(
        `${BUTTON_IMPORT}export const A = () => <Button className="${classes}" />;\n`,
      ),
    ).toEqual(['button-restyle:2']);
  });

  it('allows layout classes on a Button', () => {
    expect(
      scanButtons(
        `${BUTTON_IMPORT}export const A = () => <Button className="w-full mt-2 justify-start" />;\n`,
      ),
    ).toEqual([]);
  });

  it('flags an UNSTYLED Button that paints its own look', () => {
    expect(
      scanButtons(
        `${BUTTON_IMPORT}export const A = () => <Button variant={ButtonVariant.UNSTYLED} className="rounded-full bg-muted px-3" />;\n`,
      ),
    ).toEqual(['unstyled-look:2']);
  });

  it('allows an UNSTYLED Button that only lays itself out', () => {
    expect(
      scanButtons(
        `${BUTTON_IMPORT}export const A = () => <Button variant={ButtonVariant.UNSTYLED} className="flex w-full items-center text-left" />;\n`,
      ),
    ).toEqual([]);
  });

  it('flags a native title tooltip on a plain element', () => {
    expect(
      scanButtons(
        'export const A = ({ name }: { name: string }) => <span title={name}>{name}</span>;\n',
      ),
    ).toEqual(['native-title:1']);
  });

  it('allows a title on an iframe', () => {
    expect(
      scanButtons(
        'export const A = () => <iframe title="Preview" src="x" />;\n',
      ),
    ).toEqual([]);
  });

  it('flags onClick on a div without a role or key handler', () => {
    expect(
      scanButtons(
        'export const A = ({ go }: { go: () => void }) => <div onClick={go}>Open</div>;\n',
      ),
    ).toEqual(['clickable-element:1']);
  });

  it.each([
    ['a role', 'role="button" tabIndex={0}'],
    ['a key handler', 'onKeyDown={go}'],
  ])('allows onClick on a div with %s', (_name, extra) => {
    expect(
      scanButtons(
        `export const A = ({ go }: { go: () => void }) => <div onClick={go} ${extra}>Open</div>;\n`,
      ),
    ).toEqual([]);
  });

  it('honours ui-guard-allow only with a reason', () => {
    const withReason = `${BUTTON_IMPORT}export const A = () => (
  // ui-guard-allow:button-restyle -- brand-coloured share button
  <Button className="bg-black/50" />
);
`;
    const withoutReason = withReason.replace(
      ' -- brand-coloured share button',
      '',
    );
    expect(scanButtons(withReason)).toEqual([]);
    expect(scanButtons(withoutReason)).toEqual(['button-restyle:4']);
  });
});

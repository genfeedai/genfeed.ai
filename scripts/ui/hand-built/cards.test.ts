import { describe, expect, it } from 'vitest';
import { scanSource } from './cards';

function rulesFor(jsx: string): string[] {
  return scanSource(`export const X = () => (${jsx});`).map(
    (violation) => violation.rule,
  );
}

describe('cards guard', () => {
  it.each([
    [
      'hand-built card with a border',
      '<div className="rounded-md border border-border bg-card p-3">x</div>',
    ],
    [
      'hand-built panel without a border',
      '<section className="rounded-lg bg-tertiary p-4">x</section>',
    ],
    [
      'hand-built row with horizontal and vertical padding',
      '<li className="rounded-md bg-muted px-3 py-2">x</li>',
    ],
    [
      'surface classes split across cn() arguments',
      '<div className={cn("rounded-card shadow-border", isOn && "bg-card p-4")}>x</div>',
    ],
  ])('flags %s', (_name, jsx) => {
    expect(rulesFor(jsx)).toEqual(['hand-built-card']);
  });

  it.each([
    ['padding in bodyClassName', '<Card bodyClassName="gap-3 p-4">x</Card>'],
    ['a background in className', '<Card className="bg-background">x</Card>'],
    [
      'a conditional border in className',
      '<Card className={cn(isOn && "border-primary")}>x</Card>',
    ],
    ['typography in bodyClassName', '<Card bodyClassName="text-sm">x</Card>'],
  ])('flags a Card restyle: %s', (_name, jsx) => {
    expect(rulesFor(jsx)).toEqual(['card-restyle']);
  });

  it.each([
    [
      'a Card with props',
      '<Card padding={CardPadding.SM} gap={CardGap.NONE}>x</Card>',
    ],
    [
      'layout classes on Card',
      '<Card className="h-full w-full min-w-0 overflow-hidden" bodyClassName="flex-row items-center justify-between">x</Card>',
    ],
    [
      'a pill',
      '<div className="inline-flex rounded-full bg-muted px-3 py-1">x</div>',
    ],
    [
      'a toolbar chip with tiny padding',
      '<div className="rounded-md bg-background/90 p-0.5">x</div>',
    ],
    [
      'a floating menu',
      '<div className="absolute rounded-md bg-muted px-3 py-2">x</div>',
    ],
    [
      'a button-like tile',
      '<div role="checkbox" className="rounded-md border border-border bg-card px-3 py-2">x</div>',
    ],
    ['a layout wrapper', '<div className="flex flex-col gap-4 p-4">x</div>'],
  ])('allows %s', (_name, jsx) => {
    expect(rulesFor(jsx)).toEqual([]);
  });

  it('honours an allow comment that states a reason', () => {
    const source = `export const X = () => (
      <>
        {/* ui-guard-allow:hand-built-card -- chat bubble, not a card */}
        <div className="rounded-xl bg-muted px-3 py-2 text-sm">x</div>
      </>
    );`;
    expect(scanSource(source)).toEqual([]);
  });

  it('ignores an allow comment without a reason', () => {
    const source = `export const X = () => (
      <>
        {/* ui-guard-allow:hand-built-card */}
        <div className="rounded-xl bg-muted px-3 py-2">x</div>
      </>
    );`;
    expect(scanSource(source).map((violation) => violation.rule)).toEqual([
      'hand-built-card',
    ]);
  });

  it('is not silenced by the design-system color marker', () => {
    const source = `export const X = () => (
      <div className="rounded-md bg-card p-4 shadow-border"> {/* design-system-allow-content-color */}
        x
      </div>
    );`;
    expect(scanSource(source).map((violation) => violation.rule)).toEqual([
      'hand-built-card',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { compareToBaseline, detectInFile } from './avatars';

function rulesFor(source: string): string[] {
  return detectInFile('apps/web/Sample.tsx', source).map(
    (violation) => violation.rule,
  );
}

describe('avatars guard', () => {
  it('blocks restyling the shared Avatar with classes', () => {
    expect(
      rulesFor(
        `export default function A(){return <Avatar className="size-7 rounded-xl bg-card" name="Ada" />;}`,
      ),
    ).toEqual(['avatar-restyle']);
  });

  it('blocks restyling through cn() and conditional classes', () => {
    expect(
      rulesFor(
        `export default function A(){return <Avatar className={cn('shrink-0', isActive && 'ring-2 text-primary')} name="Ada" />;}`,
      ),
    ).toEqual(['avatar-restyle']);
  });

  it.each([
    'mt-0.5',
    'shrink-0',
    'aspect-square',
    'absolute left-1/2 -translate-x-1/2 -bottom-12',
    'md:mx-auto',
  ])('lets layout classes through on Avatar (%s)', (className) => {
    expect(
      rulesFor(
        `export default function A(){return <Avatar className="${className}" name="Ada" />;}`,
      ),
    ).toEqual([]);
  });

  it('blocks a rounded frame around an initial', () => {
    expect(
      rulesFor(
        `export default function A({ name }){return <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm">{name.charAt(0).toUpperCase()}</div>;}`,
      ),
    ).toEqual(['hand-built-avatar']);
  });

  it('blocks a rounded frame around a picture', () => {
    expect(
      rulesFor(
        `export default function A({ url }){return <div className="size-24 overflow-hidden rounded-full bg-muted"><Image alt="" src={url} /></div>;}`,
      ),
    ).toEqual(['hand-built-avatar']);
  });

  it('blocks a round picture and a square logo', () => {
    expect(
      rulesFor(
        `export default function A({ url }){return <Image alt="" className="size-10 rounded-full object-cover" src={url} />;}`,
      ),
    ).toEqual(['hand-built-avatar']);
    expect(
      rulesFor(
        `export default function A({ brand }){return <Image alt="" className="size-6 rounded-md object-cover" src={brand.logoUrl} />;}`,
      ),
    ).toEqual(['hand-built-avatar']);
  });

  it('leaves square media thumbnails alone', () => {
    expect(
      rulesFor(
        `export default function A({ preview }){return <Image alt="" className="size-10 rounded-md object-cover" src={preview} />;}`,
      ),
    ).toEqual([]);
  });

  it('leaves round dots, step circles and spinners alone', () => {
    expect(
      rulesFor(
        `export default function A(){return <><span className="size-2 rounded-full bg-success" /><div className="flex size-6 items-center justify-center rounded-full bg-primary text-xs">{step}</div></>;}`,
      ),
    ).toEqual([]);
  });

  it('blocks private initials helpers and variables', () => {
    expect(
      rulesFor(`function getReviewerInitials(name: string) { return name; }`),
    ).toEqual(['private-initials']);
    expect(
      rulesFor(
        `export default function A({ label }){ const initials = label.split(' ').map((p) => p[0]).join(''); return null; }`,
      ),
    ).toEqual(['private-initials']);
    expect(
      rulesFor(
        `export default function A({ label }){ const initial = label.charAt(0).toUpperCase(); return null; }`,
      ),
    ).toEqual(['private-initials']);
  });

  it('accepts initials that come from getInitials()', () => {
    expect(
      rulesFor(
        `export default function A({ label }){ const initials = getInitials(label); return null; }`,
      ),
    ).toEqual([]);
  });

  it('honours ui-guard-allow with a reason, and nothing else', () => {
    const frame = `<div className="flex size-10 items-center justify-center rounded-full bg-muted">{name.charAt(0)}</div>`;
    expect(
      rulesFor(
        `export default function A(){return (\n// ui-guard-allow:hand-built-avatar -- animated brand mark\n${frame});}`,
      ),
    ).toEqual([]);
    expect(
      rulesFor(
        `export default function A(){return (\n// ui-guard-allow:hand-built-avatar\n${frame});}`,
      ),
    ).toEqual(['hand-built-avatar']);
    expect(
      rulesFor(
        `export default function A(){return (\n// design-system-allow-content-color\n${frame});}`,
      ),
    ).toEqual(['hand-built-avatar']);
  });
});

describe('avatars baseline', () => {
  const violation = (file: string) => ({
    file,
    line: 1,
    message: '',
    rule: 'hand-built-avatar' as const,
  });

  it('fails a spot the baseline does not list', () => {
    expect(
      compareToBaseline([violation('a.tsx')], {}).excess.map((v) => v.file),
    ).toEqual(['a.tsx']);
  });

  it('tolerates listed spots and asks for the entry to go once fixed', () => {
    const baseline = { 'a.tsx#hand-built-avatar': 2 };
    expect(compareToBaseline([violation('a.tsx')], baseline).stale).toEqual([
      'a.tsx#hand-built-avatar',
    ]);
    expect(
      compareToBaseline([violation('a.tsx'), violation('a.tsx')], baseline),
    ).toEqual({ excess: [], stale: [] });
  });
});

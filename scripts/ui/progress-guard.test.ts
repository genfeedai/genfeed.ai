import { describe, expect, it } from 'vitest';
import { detectProgressViolations } from './hand-built/progress';

function rulesFor(source: string): string[] {
  return detectProgressViolations('apps/web/Example.tsx', source).map(
    (violation) => violation.rule,
  );
}

describe('progress guard', () => {
  it.each([
    [
      'height and colour on Progress',
      'export default function A(){return <Progress className="h-1 bg-muted" value={1} />;}',
      ['restyle'],
    ],
    [
      'indicatorClassName',
      'export default function A(){return <Progress indicatorClassName="bg-success" value={1} />;}',
      ['restyle'],
    ],
    [
      'shape inside cn()',
      "export default function A(){return <Progress className={cn('rounded-none', x)} value={1} />;}",
      ['restyle'],
    ],
    [
      'hand-built fill with inline width',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text
      'export default function A({p}:{p:number}){return <div className="h-full bg-primary" style={{ width: `${p}%` }} />;}',
      ['bar'],
    ],
    [
      'hand-built fill with scaleX',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text
      'export default function A({p}:{p:number}){return <span className="block h-1 bg-white" style={{ transform: `scaleX(${p})` }} />;}',
      ['bar'],
    ],
    [
      'hand-built step circle',
      'import { Check } from \'lucide-react\';\nexport default function A(){return <div className="flex size-6 items-center justify-center rounded-full text-2xs font-bold"><Check /></div>;}',
      ['stepper'],
    ],
  ])('blocks %s', (_name, source, expected) => {
    expect(rulesFor(source)).toEqual(expected);
  });

  it.each([
    [
      'layout classes on Progress',
      'export default function A(){return <Progress className="w-24 flex-1 mb-6" size="xs" tone="success" value={1} />;}',
    ],
    [
      'a sized wrapper with a non-percent width',
      "export default function A(){return <div className=\"h-full\" style={{ maxWidth: '100%', width: '100%' }} />;}",
    ],
    [
      'a selection check badge',
      'import { Check } from \'lucide-react\';\nexport default function A(){return <span className="flex size-5 items-center justify-center rounded-full bg-primary"><Check /></span>;}',
    ],
    [
      'an allowed line with a reason',
      'export default function A(){\n// ui-guard-allow:progress -- chart axis, not a progress bar\nreturn <Progress className="h-1" value={1} />;}',
    ],
  ])('allows %s', (_name, source) => {
    expect(rulesFor(source)).toEqual([]);
  });

  it('does not accept the content-colour marker or a reasonless allow', () => {
    expect(
      rulesFor(
        'export default function A(){\n// design-system-allow-content-color\nreturn <Progress className="h-1" value={1} />;}',
      ),
    ).toEqual(['restyle']);
    expect(
      rulesFor(
        'export default function A(){\n// ui-guard-allow:progress\nreturn <Progress className="h-1" value={1} />;}',
      ),
    ).toEqual(['restyle']);
  });
});

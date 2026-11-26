import { describe, expect, it } from 'vitest';
import { buildAnnotationSvg, prepareAnnotationShapes } from './annotation-svg';

describe('buildAnnotationSvg', () => {
  it('scales normalized shapes to the image and escapes text', () => {
    const svg = buildAnnotationSvg(
      [
        {
          height: 0.25,
          id: 'a',
          kind: 'rectangle',
          width: 0.5,
          x: 0.1,
          y: 0.2,
        },
        { id: 'b', kind: 'text', text: 'A <b> & "c"', x: 0.5, y: 0.5 },
      ],
      2000,
      1000,
    );

    expect(svg).toContain('width="2000" height="1000"');
    expect(svg).toContain('<rect x="200" y="200" width="1000" height="250"/>');
    expect(svg).toContain('A &lt;b&gt; &amp; &quot;c&quot;');
    expect(svg).toContain('stroke-width="6"');
  });

  it('draws an arrow head at the last point', () => {
    const svg = buildAnnotationSvg(
      [
        {
          id: 'a',
          kind: 'arrow',
          points: [
            { x: 0, y: 0.5 },
            { x: 1, y: 0.5 },
          ],
        },
      ],
      1000,
      1000,
    );

    expect(svg).toContain('<polyline points="0,500 1000,500"/>');
    expect(svg).toContain('<polyline points="');
    expect(svg.match(/<polyline/g)).toHaveLength(2);
  });
});

describe('prepareAnnotationShapes', () => {
  it.each([
    [undefined, 'Add at least one annotation'],
    [[], 'Add at least one annotation'],
    [[{ id: 'a', kind: 'star' }], 'unknown or incomplete shape'],
    [
      [{ height: 0, id: 'a', kind: 'rectangle', width: 0.2, x: 0.1, y: 0.1 }],
      'rectangle annotation (noArea)',
    ],
    [
      [{ id: 'a', kind: 'text', text: '  ', x: 0.1, y: 0.1 }],
      'text annotation (emptyText)',
    ],
    [
      [{ id: 'a', kind: 'text', text: 'x'.repeat(281), x: 0.1, y: 0.1 }],
      'at most 280 characters',
    ],
  ])('refuses %j', (value, message) => {
    expect(() => prepareAnnotationShapes(value)).toThrow(message);
  });

  it('returns valid shapes unchanged', () => {
    const shape = {
      id: 'a',
      kind: 'text',
      text: 'Hi',
      x: 0.1,
      y: 0.1,
    } as const;
    expect(prepareAnnotationShapes([shape])).toEqual([shape]);
  });
});

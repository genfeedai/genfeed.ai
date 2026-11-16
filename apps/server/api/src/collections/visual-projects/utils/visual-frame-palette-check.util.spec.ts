import { checkFramePalette } from '@api/collections/visual-projects/utils/visual-frame-palette-check.util';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const palette = [
  { role: 'Primary', color: '#112233' },
  { role: 'Accent', color: '#E63946' },
];

/** A frame whose left part is `main` and whose right part is `side`. */
function frame(main: string, side?: string, sideShare = 0.5): Promise<Buffer> {
  const width = 100;
  const sideWidth = Math.round(width * sideShare);
  const base = sharp({
    create: { width, height: 100, channels: 3, background: main },
  });
  return (
    side
      ? base.composite([
          {
            input: {
              create: {
                width: sideWidth,
                height: 100,
                channels: 3,
                background: side,
              },
            },
            left: width - sideWidth,
            top: 0,
          },
        ])
      : base
  )
    .png()
    .toBuffer();
}

describe('checkFramePalette', () => {
  it('passes frames made of palette colours', async () => {
    const frames = [
      await frame('#112233', '#E63946'),
      await frame('#112233'),
      await frame('#E63946', '#112233'),
    ];
    expect(await checkFramePalette(frames, palette)).toEqual({
      status: 'passed',
      issues: [],
    });
  });

  it('allows black, white and grey, which carry no hue', async () => {
    const frames = [
      await frame('#112233', '#FFFFFF'),
      await frame('#000000', '#808080'),
      await frame('#112233'),
    ];
    expect((await checkFramePalette(frames, palette)).status).toBe('passed');
  });

  it('names a dominant colour outside the palette and the frame it is in', async () => {
    const frames = [
      await frame('#112233'),
      await frame('#112233', '#2EC4B6', 0.4),
      await frame('#112233'),
    ];
    expect(await checkFramePalette(frames, palette)).toEqual({
      status: 'failed',
      issues: [
        'Colour #2EC4B6 covers 40% of the middle frame and is outside the approved palette (closest: Primary #112233).',
      ],
    });
  });

  it('ignores an off-palette colour that covers only a sliver of the frame', async () => {
    const frames = [await frame('#112233', '#2EC4B6', 0.02)];
    expect((await checkFramePalette(frames, palette)).status).toBe('passed');
  });

  it('is not checked, never passed, without a palette or with frames it cannot read', async () => {
    expect(await checkFramePalette([await frame('#2EC4B6')], [])).toEqual({
      status: 'not_checked',
      issues: [],
    });
    expect(
      await checkFramePalette([Buffer.from('not an image')], palette),
    ).toEqual({ status: 'not_checked', issues: [] });
  });
});

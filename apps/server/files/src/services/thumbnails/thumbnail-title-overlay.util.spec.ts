import {
  overlayTitle,
  wrapTitle,
} from '@files/services/thumbnails/thumbnail-title-overlay.util';
import sharp from 'sharp';

async function solidFrame(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { background: { b: 40, g: 40, r: 40 }, channels: 3, height, width },
  })
    .png()
    .toBuffer();
}

async function redOfPixel(
  image: Buffer,
  left: number,
  top: number,
): Promise<number> {
  const pixel = await sharp(image)
    .extract({ height: 1, left, top, width: 1 })
    .raw()
    .toBuffer();
  return pixel[0] ?? -1;
}

describe('wrapTitle', () => {
  it('wraps on word boundaries within the line width', () => {
    expect(wrapTitle('one two three four', 9)).toEqual([
      'one two',
      'three',
      'four',
    ]);
  });

  it('hard-splits a word longer than a line', () => {
    expect(wrapTitle('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('ends the last allowed line with an ellipsis when the title overflows', () => {
    const lines = wrapTitle('aa bb cc dd ee ff', 2, 3);
    expect(lines).toHaveLength(3);
    expect(lines[2]?.endsWith('…')).toBe(true);
  });

  it('returns nothing for a blank title', () => {
    expect(wrapTitle('   ', 10)).toEqual([]);
  });
});

describe('overlayTitle', () => {
  it('keeps the frame dimensions and darkens the bottom for the scrim', async () => {
    const frame = await solidFrame(540, 960);

    const result = await overlayTitle(frame, 'Ship the open source studio');

    const meta = await sharp(result).metadata();
    expect([meta.width, meta.height]).toEqual([540, 960]);
    const top = await redOfPixel(result, 4, 4);
    const bottom = await redOfPixel(result, 4, 955);
    expect(top).toBe(40);
    expect(bottom).toBeLessThan(top);
  });

  it('returns the frame untouched for a blank title', async () => {
    const frame = await solidFrame(64, 64);

    expect(await overlayTitle(frame, '  ')).toBe(frame);
  });

  it('survives markup characters in the title', async () => {
    const frame = await solidFrame(540, 960);

    await expect(
      overlayTitle(frame, `<b>"Tom & Jerry's"</b>`),
    ).resolves.toBeInstanceOf(Buffer);
  });
});

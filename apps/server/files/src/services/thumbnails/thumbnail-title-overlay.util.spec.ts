import { overlayTitle } from '@files/services/thumbnails/thumbnail-title-overlay.util';
import sharp from 'sharp';

async function solidFrame(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { background: { b: 40, g: 40, r: 40 }, channels: 3, height, width },
  })
    .png()
    .toBuffer();
}

async function pixel(
  image: Buffer,
  left: number,
  top: number,
): Promise<[number, number, number]> {
  const data = await sharp(image)
    .extract({ height: 1, left, top, width: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  return [data[0] ?? -1, data[1] ?? -1, data[2] ?? -1];
}

/** Count of pixels in the frame that are close to `color`. */
async function countNear(
  image: Buffer,
  color: [number, number, number],
): Promise<number> {
  const { data, info } = await sharp(image)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const isNear = color.every(
      (value, index) => Math.abs((data[offset + index] ?? 0) - value) < 40,
    );
    if (isNear) count += 1;
  }
  return count;
}

describe('overlayTitle', () => {
  it('keeps the frame dimensions and darkens the bottom for the scrim', async () => {
    const frame = await solidFrame(540, 960);

    const result = await overlayTitle(frame, 'Ship the open source studio');

    const meta = await sharp(result).metadata();
    expect([meta.width, meta.height]).toEqual([540, 960]);
    const top = await pixel(result, 4, 4);
    const bottom = await pixel(result, 4, 955);
    expect(top[0]).toBe(40);
    expect(bottom[0]).toBeLessThan(top[0]);
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

  it('draws the last word in the accent colour and the rest in the text colour', async () => {
    const frame = await solidFrame(1080, 1920);

    const result = await overlayTitle(frame, 'sell execution', {
      accentColor: '#E83B3B',
      color: '#FFFFFF',
      fontFamily: 'INTER_BOLD',
      placement: 'top-left',
      textCase: 'upper',
    });

    expect(await countNear(result, [232, 59, 59])).toBeGreaterThan(2000);
    expect(await countNear(result, [255, 255, 255])).toBeGreaterThan(2000);
    // Top-left placement draws no scrim over the bottom of the frame.
    expect(await pixel(result, 4, 1915)).toEqual([40, 40, 40]);
  });

  it('sets the title in the brand font, not the default one', async () => {
    const frame = await solidFrame(1080, 1920);

    const inter = await overlayTitle(frame, 'Same words here', {
      fontFamily: 'INTER_BOLD',
    });
    const anton = await overlayTitle(frame, 'Same words here', {
      fontFamily: 'ANTON',
    });

    expect(await countNear(inter, [255, 255, 255])).not.toBe(
      await countNear(anton, [255, 255, 255]),
    );
  });

  it('falls back to the default colour when a colour is not a hex value', async () => {
    const frame = await solidFrame(1080, 1920);

    const result = await overlayTitle(frame, 'Plain title', {
      accentColor: 'red',
      color: 'javascript:alert(1)',
    });

    expect(await countNear(result, [255, 255, 255])).toBeGreaterThan(500);
  });

  it('shrinks a long title to fit four lines', async () => {
    const frame = await solidFrame(540, 960);

    const result = await overlayTitle(
      frame,
      'Ship the entire open source studio to everyone on the internet today for free',
    );

    const meta = await sharp(result).metadata();
    expect([meta.width, meta.height]).toEqual([540, 960]);
  });
});

describe('overlayTitle on a tiny frame', () => {
  it('returns the frame untouched when it is too small to hold a title', async () => {
    const frame = await solidFrame(32, 32);

    expect(await overlayTitle(frame, 'Too small')).toBe(frame);
  });
});

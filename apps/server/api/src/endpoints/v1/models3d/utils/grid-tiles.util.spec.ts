import { cropAngleSheet } from '@api/endpoints/v1/models3d/utils/grid-tiles.util';
import sharp from 'sharp';

async function sheetOf(size: number): Promise<Buffer> {
  return sharp({
    create: {
      background: { b: 0, g: 0, r: 0 },
      channels: 3,
      height: size,
      width: size,
    },
  })
    .png()
    .toBuffer();
}

describe('cropAngleSheet', () => {
  it('returns the eight outer views and drops the centre cell', async () => {
    const tiles = await cropAngleSheet(await sheetOf(300));

    expect(tiles.map((tile) => tile.index)).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
  });

  it('crops every view to a third of the sheet', async () => {
    const tiles = await cropAngleSheet(await sheetOf(301));

    for (const tile of tiles) {
      const { height, width } = await sharp(tile.data).metadata();
      expect({ height, width }).toEqual({ height: 100, width: 100 });
    }
  });

  it('keeps each cell its own pixels', async () => {
    const cell = 20;
    const raw = Buffer.alloc(cell * 3 * cell * 3 * 3);
    for (let y = 0; y < cell * 3; y++) {
      for (let x = 0; x < cell * 3; x++) {
        const cellIndex = Math.floor(y / cell) * 3 + Math.floor(x / cell);
        raw[(y * cell * 3 + x) * 3] = cellIndex * 20;
      }
    }
    const sheet = await sharp(raw, {
      raw: { channels: 3, height: cell * 3, width: cell * 3 },
    })
      .png()
      .toBuffer();

    const tiles = await cropAngleSheet(sheet);

    for (const tile of tiles) {
      const { data } = await sharp(tile.data)
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(data[0]).toBe(tile.index * 20);
    }
  });

  it('rejects a sheet too small to crop', async () => {
    await expect(cropAngleSheet(await sheetOf(2))).rejects.toThrow('too small');
  });
});

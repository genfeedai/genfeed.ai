import {
  MODELS3D_GRID_CENTER_INDEX,
  MODELS3D_GRID_SIZE,
} from '@api/endpoints/v1/models3d/models3d.constants';
import sharp from 'sharp';

export interface GridTile {
  data: Buffer;
  index: number;
}

/**
 * Crops a square 3x3 angle sheet into its eight outer views. The centre cell
 * repeats the source photo, which the build already receives, so it is dropped.
 */
export async function cropAngleSheet(sheet: Buffer): Promise<GridTile[]> {
  const metadata = await sharp(sheet).metadata();
  const { height, width } = metadata;
  if (!width || !height) {
    throw new Error('The angle sheet has no readable dimensions');
  }
  const tileWidth = Math.floor(width / MODELS3D_GRID_SIZE);
  const tileHeight = Math.floor(height / MODELS3D_GRID_SIZE);
  if (tileWidth < 1 || tileHeight < 1) {
    throw new Error('The angle sheet is too small to crop');
  }

  const tiles: GridTile[] = [];
  for (
    let index = 0;
    index < MODELS3D_GRID_SIZE * MODELS3D_GRID_SIZE;
    index++
  ) {
    if (index === MODELS3D_GRID_CENTER_INDEX) continue;
    const row = Math.floor(index / MODELS3D_GRID_SIZE);
    const column = index % MODELS3D_GRID_SIZE;
    const data = await sharp(sheet)
      .extract({
        height: tileHeight,
        left: column * tileWidth,
        top: row * tileHeight,
        width: tileWidth,
      })
      .png()
      .toBuffer();
    tiles.push({ data, index });
  }
  return tiles;
}

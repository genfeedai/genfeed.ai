import { BRAND_LUT_LIMITS } from '@genfeedai/contracts/constants';
import { BadRequestException } from '@nestjs/common';

const CUBE_FILE_NAME = /\.cube$/i;
const GRID_SIZE_LINE = /^LUT_3D_SIZE\s+(\d+)$/;
const DOMAIN_LINE = /^DOMAIN_(MIN|MAX)\s+\S+\s+\S+\s+\S+$/;
const TITLE_LINE = /^TITLE\s/;
const SAMPLE_LINE = /^\S+\s+\S+\s+\S+$/;

export interface ParsedCubeLut {
  gridSize: number;
}

function isControl(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code < 32 || (code >= 127 && code <= 159);
}

/** The uploaded name without a path or control characters, at most 256 characters. */
export function normalizeBrandLutFileName(value: string): string {
  const basename =
    (typeof value === 'string' ? value : '')
      .replace(/\\/g, '/')
      .split('/')
      .at(-1) ?? '';
  const name = Array.from(basename)
    .filter((character) => !isControl(character))
    .join('')
    .trim();
  if (!CUBE_FILE_NAME.test(name) || Array.from(name).length > 256) {
    throw new BadRequestException('The LUT must be a .cube file');
  }
  return name;
}

/**
 * Reads a `.cube` 3D LUT the way ffmpeg's `lut3d` filter will, so a file the
 * worker would reject is turned away at upload instead of failing a render.
 * Anything but a complete 3D grid of finite samples is refused.
 */
export function parseBrandCubeLut(buffer: Buffer): ParsedCubeLut {
  if (buffer.length === 0 || buffer.length > BRAND_LUT_LIMITS.MAX_BYTES) {
    throw new BadRequestException('The LUT file is empty or too large');
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new BadRequestException('The LUT file must be UTF-8 text');
  }

  let gridSize: number | undefined;
  let sampleCount = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || TITLE_LINE.test(line)) continue;
    if (line.startsWith('LUT_1D_SIZE')) {
      throw new BadRequestException('Only 3D LUTs are supported');
    }
    const sizeMatch = GRID_SIZE_LINE.exec(line);
    if (sizeMatch) {
      if (gridSize !== undefined) {
        throw new BadRequestException('The LUT declares its size twice');
      }
      gridSize = Number(sizeMatch[1]);
      if (
        gridSize < BRAND_LUT_LIMITS.MIN_GRID_SIZE ||
        gridSize > BRAND_LUT_LIMITS.MAX_GRID_SIZE
      ) {
        throw new BadRequestException(
          `The LUT grid must be ${BRAND_LUT_LIMITS.MIN_GRID_SIZE}–${BRAND_LUT_LIMITS.MAX_GRID_SIZE} points per side`,
        );
      }
      continue;
    }
    if (DOMAIN_LINE.test(line)) continue;
    if (
      !SAMPLE_LINE.test(line) ||
      line.split(/\s+/).some((part) => !Number.isFinite(Number(part)))
    ) {
      throw new BadRequestException('The LUT file has a line it cannot read');
    }
    if (gridSize === undefined) {
      throw new BadRequestException('The LUT must declare LUT_3D_SIZE first');
    }
    sampleCount += 1;
    if (sampleCount > gridSize ** 3) break;
  }

  if (gridSize === undefined || sampleCount !== gridSize ** 3) {
    throw new BadRequestException(
      'The LUT does not hold a complete 3D colour grid',
    );
  }
  return { gridSize };
}

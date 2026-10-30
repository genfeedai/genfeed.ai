import {
  normalizeBrandLutFileName,
  parseBrandCubeLut,
} from '@api/collections/brands/utils/brand-lut.util';
import { BRAND_LUT_LIMITS } from '@genfeedai/contracts/constants';
import { BadRequestException } from '@nestjs/common';

function cube(size: number, header: string[] = []): string {
  const samples: string[] = [];
  for (let blue = 0; blue < size; blue++)
    for (let green = 0; green < size; green++)
      for (let red = 0; red < size; red++)
        samples.push(
          `${red / (size - 1)} ${green / (size - 1)} ${blue / (size - 1)}`,
        );
  return [...header, `LUT_3D_SIZE ${size}`, ...samples].join('\n');
}

const parse = (text: string) => parseBrandCubeLut(Buffer.from(text, 'utf8'));

describe('parseBrandCubeLut', () => {
  it('reads a complete grid with its header lines', () => {
    expect(
      parse(
        cube(17, [
          '# exported from the grading suite',
          'TITLE "Brand look"',
          'DOMAIN_MIN 0.0 0.0 0.0',
          'DOMAIN_MAX 1.0 1.0 1.0',
          '',
        ]),
      ),
    ).toEqual({ gridSize: 17 });
  });

  it('reads windows line endings', () => {
    expect(parse(cube(2).replace(/\n/g, '\r\n'))).toEqual({ gridSize: 2 });
  });

  it.each([
    ['an empty file', ''],
    ['a 1D LUT', 'LUT_1D_SIZE 4\n0 0 0\n1 1 1\n'],
    [
      'a grid with samples missing',
      cube(4).split('\n').slice(0, -1).join('\n'),
    ],
    ['a grid with extra samples', `${cube(2)}\n0 0 0`],
    ['samples before the size', `0 0 0\n${cube(2)}`],
    ['a size declared twice', cube(2, ['LUT_3D_SIZE 2'])],
    ['a grid of one point', cube(2).replace('LUT_3D_SIZE 2', 'LUT_3D_SIZE 1')],
    ['a grid beyond the limit', 'LUT_3D_SIZE 66\n0 0 0'],
    ['a sample that is not a number', `${cube(2)}`.replace('0 0 0', 'a b c')],
    ['a sample that is not finite', `${cube(2)}`.replace('0 0 0', '0 0 NaN')],
    ['a line it cannot read', `${cube(2)}\nhello world`],
  ])('refuses %s', (_label, text) => {
    expect(() => parse(text)).toThrow(BadRequestException);
  });

  it('refuses bytes that are not UTF-8 text', () => {
    expect(() => parseBrandCubeLut(Buffer.from([0xff, 0xfe, 0x00]))).toThrow(
      BadRequestException,
    );
  });

  it('refuses a file over the size limit', () => {
    expect(() =>
      parseBrandCubeLut(Buffer.alloc(BRAND_LUT_LIMITS.MAX_BYTES + 1, 0x20)),
    ).toThrow(BadRequestException);
  });
});

describe('normalizeBrandLutFileName', () => {
  it('keeps the file name and drops the folder', () => {
    expect(normalizeBrandLutFileName('C:\\looks\\Brand Look.CUBE')).toBe(
      'Brand Look.CUBE',
    );
  });

  it.each(['look.png', 'look.cube.exe', '', '.cube/'])('refuses %j', (name) => {
    expect(() => normalizeBrandLutFileName(name)).toThrow(BadRequestException);
  });
});

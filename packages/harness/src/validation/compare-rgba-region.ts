export function compareBrandRgbaRegion(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  regionWidth: number,
  regionHeight: number,
  expected: Uint8Array,
): boolean {
  if (
    !(pixels instanceof Uint8Array) ||
    !(expected instanceof Uint8Array) ||
    !Number.isSafeInteger(width) ||
    width <= 0 ||
    !Number.isSafeInteger(height) ||
    height <= 0 ||
    !Number.isSafeInteger(regionWidth) ||
    regionWidth <= 0 ||
    !Number.isSafeInteger(regionHeight) ||
    regionHeight <= 0 ||
    !Number.isSafeInteger(x) ||
    x < 0 ||
    !Number.isSafeInteger(y) ||
    y < 0 ||
    width > 1920 ||
    height > 1080 ||
    regionWidth > width ||
    regionHeight > height ||
    x > width - regionWidth ||
    y > height - regionHeight ||
    pixels.byteLength !== width * height * 4 ||
    expected.byteLength !== regionWidth * regionHeight * 4
  ) {
    throw new RangeError('brand_validation_invalid_rgba_region');
  }

  for (let row = 0; row < regionHeight; row++) {
    const sourceOffset = ((y + row) * width + x) * 4;
    const expectedOffset = row * regionWidth * 4;
    for (let column = 0; column < regionWidth * 4; column++) {
      if (pixels[sourceOffset + column] !== expected[expectedOffset + column]) {
        return false;
      }
    }
  }
  return true;
}

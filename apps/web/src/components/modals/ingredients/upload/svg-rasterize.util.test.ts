import { describe, expect, it } from 'vitest';
import {
  isSvgUpload,
  readSvgSize,
  resolveRasterSize,
} from './svg-rasterize.util';

const svg = (attributes: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}><rect width="10" height="10"/></svg>`;

describe('isSvgUpload', () => {
  it.each([
    ['logo.svg', 'image/svg+xml', true],
    ['logo.SVG', '', true],
    ['logo.svg', 'image/png', false],
    ['photo.png', 'image/png', false],
    ['notes.txt', '', false],
  ])('%s declared as "%s" is %s', (name, type, expected) => {
    expect(isSvgUpload(new File(['x'], name, { type }))).toBe(expected);
  });
});

describe('readSvgSize', () => {
  it.each([
    ['width="64" height="48"', { height: 48, width: 64 }],
    ['width="64px" height="48px"', { height: 48, width: 64 }],
    ['viewBox="0 0 100 50"', { height: 50, width: 100 }],
    ['viewBox="0,0,100,50" width="200"', { height: 100, width: 200 }],
    ['viewBox="0 0 100 50" height="25"', { height: 25, width: 50 }],
    ['width="50%" height="50%" viewBox="0 0 80 40"', { height: 40, width: 80 }],
  ])('reads %s', (attributes, expected) => {
    expect(readSvgSize(svg(attributes))).toEqual(expected);
  });

  it.each([
    ['no size', svg('')],
    ['malformed markup', '<svg><not closed'],
    ['a non-svg root', '<html xmlns="http://www.w3.org/1999/xhtml"/>'],
  ])('returns undefined for %s', (_label, markup) => {
    expect(readSvgSize(markup)).toBeUndefined();
  });
});

describe('resolveRasterSize', () => {
  it.each([
    [
      { height: 64, width: 64 },
      { height: 256, width: 256 },
    ],
    [
      { height: 50, width: 100 },
      { height: 200, width: 400 },
    ],
    [
      { height: 5000, width: 10000 },
      { height: 1024, width: 2048 },
    ],
    [
      { height: 1000, width: 400 },
      { height: 2048, width: 819 },
    ],
    [undefined, { height: 512, width: 512 }],
  ])('rasterizes %j at %j', (size, expected) => {
    expect(resolveRasterSize(size)).toEqual(expected);
  });
});

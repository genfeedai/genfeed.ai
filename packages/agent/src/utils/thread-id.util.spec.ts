import { describe, expect, it } from 'vitest';
import { isRenderableThreadId } from './thread-id.util';

describe('isRenderableThreadId', () => {
  it('accepts real thread ids', () => {
    expect(isRenderableThreadId('c-1')).toBe(true);
    expect(isRenderableThreadId('64f0c1ab2d')).toBe(true);
  });

  it('rejects nullish values', () => {
    expect(isRenderableThreadId(undefined)).toBe(false);
    expect(isRenderableThreadId(null)).toBe(false);
  });

  it('rejects empty and whitespace-only strings', () => {
    expect(isRenderableThreadId('')).toBe(false);
    expect(isRenderableThreadId('   ')).toBe(false);
  });

  it('rejects stringified nullish route params', () => {
    expect(isRenderableThreadId('undefined')).toBe(false);
    expect(isRenderableThreadId('null')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  parseCreate,
  parseExport,
  parseRevision,
  visualInputHash,
} from './visual-code-validation.util';

const create = {
  brandId: 'brand',
  requestId: 'request',
  label: 'Visual',
  sourceCode: 'export const VisualComposition=()=>null;',
  settings: {
    width: 1080,
    height: 1920,
    fps: 30 as const,
    durationFrames: 450,
  },
  maximumCredits: 10,
};
describe('visual-code application request boundary', () => {
  it('preserves source bytes and requires exactly one authoring input', () => {
    const source = '  export const VisualComposition=()=>null;\n';
    expect(parseCreate({ ...create, sourceCode: source }).sourceCode).toBe(
      source,
    );
    expect(() => parseCreate({ ...create, prompt: 'also author' })).toThrow();
    expect(() => parseCreate({ ...create, sourceCode: undefined })).toThrow();
  });
  it('bounds UTF-8 bytes, geometry, asset count and unknown fields', () => {
    expect(() =>
      parseCreate({ ...create, sourceCode: 'é'.repeat(140000) }),
    ).toThrow();
    expect(() =>
      parseCreate({
        ...create,
        settings: { ...create.settings, width: 1920, height: 1920 },
      }),
    ).toThrow();
    expect(() =>
      parseCreate({ ...create, sourceAssetIds: ['one', 'one'] }),
    ).toThrow();
    expect(() => parseCreate({ ...create, repair: true })).toThrow();
  });
  it('accepts props-only empty object by presence and preserves explicit CAS', () => {
    expect(
      parseRevision({
        requestId: 'r',
        expectedRevision: 1,
        props: {},
        maximumCredits: 0,
      }).props,
    ).toEqual({});
    expect(() =>
      parseRevision({
        requestId: 'r',
        expectedRevision: 1,
        props: {},
        prompt: 'amend',
        maximumCredits: 1,
      }),
    ).toThrow();
    expect(() =>
      parseRevision({
        requestId: 'r',
        expectedRevision: 0,
        props: {},
        maximumCredits: 1,
      }),
    ).toThrow();
  });
  it('rejects duplicate or out-of-range exports and accepts same-source asset sets', () => {
    const request = {
      requestId: 'r',
      expectedRevision: 1,
      revision: 1,
      maximumCredits: 1,
    };
    expect(() =>
      parseExport(
        { ...request, outputs: [{ format: 'mp4' }, { format: 'mp4' }] },
        create.settings,
      ),
    ).toThrow();
    expect(() =>
      parseExport(
        { ...request, outputs: [{ format: 'png', frame: 450 }] },
        create.settings,
      ),
    ).toThrow();
    expect(
      parseExport(
        {
          ...request,
          outputs: [
            { format: 'png', frame: 0 },
            { format: 'jpeg', frame: 449 },
          ],
        },
        create.settings,
      ).outputs,
    ).toHaveLength(2);
  });
  it('hashes normalized object order consistently without normalizing source bytes', () => {
    expect(visualInputHash({ b: 2, a: { y: 1, x: 0 } })).toBe(
      visualInputHash({ a: { x: 0, y: 1 }, b: 2 }),
    );
    expect(visualInputHash({ sourceCode: 'x' })).not.toBe(
      visualInputHash({ sourceCode: 'x ' }),
    );
  });
});

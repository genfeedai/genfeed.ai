import { describe, expect, it } from 'vitest';
import { getStoryboardEditorSeed } from './storyboard-editor-seed';

describe('ordered Storyboard Editor seeding', () => {
  it('uses ready shot clips in persisted order', () => {
    const result = getStoryboardEditorSeed({
      isReady: true,
      shotIds: ['second', 'first'],
      videos: {
        first: { state: 'ready', assetId: 'clip-1' },
        second: { state: 'ready', assetId: 'clip-2' },
      },
      assembly: { state: 'ready', assetId: 'assembled' },
    });
    expect(result.ids).toEqual(['clip-2', 'clip-1']);
    expect(
      new URL(result.href ?? '', 'https://example.test').searchParams.getAll(
        'video',
      ),
    ).toEqual(['clip-2', 'clip-1']);
  });
  it('blocks partial clips even if an assembly exists', () => {
    expect(
      getStoryboardEditorSeed({
        isReady: true,
        shotIds: ['a', 'b'],
        videos: { a: { state: 'ready', assetId: 'a' }, b: { state: 'failed' } },
        assembly: { state: 'ready', assetId: 'assembled' },
      }),
    ).toEqual({ reason: expect.stringContaining('incomplete') });
  });
  it('uses assembly only when individual clips are unavailable', () => {
    expect(
      getStoryboardEditorSeed({
        isReady: true,
        shotIds: ['a', 'b'],
        videos: {},
        assembly: { state: 'ready', assetId: 'assembled' },
      }).ids,
    ).toEqual(['assembled']);
    expect(
      getStoryboardEditorSeed({ isReady: false, shotIds: [], videos: {} }).href,
    ).toBeUndefined();
  });
});

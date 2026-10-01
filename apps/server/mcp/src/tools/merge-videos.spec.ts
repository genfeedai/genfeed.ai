import {
  MERGE_ZOOM_UNSUPPORTED,
  toMergeVideosParams,
} from '@mcp/tools/merge-videos';

describe('toMergeVideosParams', () => {
  it('keeps supported merge options and omits zoom keys', () => {
    expect(
      toMergeVideosParams({
        ids: ['clip-1', 'clip-2'],
        isMuteVideoAudio: true,
        musicVolume: 25,
        transition: 'fade',
        transitionDuration: 0.5,
      }),
    ).toEqual({
      ids: ['clip-1', 'clip-2'],
      isMuteVideoAudio: true,
      musicVolume: 25,
      transition: 'fade',
      transitionDuration: 0.5,
    });
  });

  it.each([
    { zoomEaseCurve: 'easyinoutcubic' },
    { zoomConfigs: [{ endZoom: 1.2, startZoom: 1 }] },
  ])('rejects zoom instead of dropping it', (zoom) => {
    expect(() =>
      toMergeVideosParams({
        ids: ['clip-1', 'clip-2'],
        ...zoom,
      }),
    ).toThrow(MERGE_ZOOM_UNSUPPORTED);
  });

  it('rejects a single clip before a merge is requested', () => {
    expect(() => toMergeVideosParams({ ids: ['clip-1'] })).toThrow(
      'ids must list at least two video ids',
    );
  });
});

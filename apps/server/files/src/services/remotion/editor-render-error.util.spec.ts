import { classifyEditorRenderError } from '@files/services/remotion/editor-render-error.util';
import {
  EditorRenderCancelledError,
  EditorRenderTimeoutError,
} from '@files/services/remotion/remotion-renderer.service';

describe('classifyEditorRenderError', () => {
  it.each([
    [new EditorRenderCancelledError(), 'cancelled'],
    [new EditorRenderTimeoutError(), 'timed_out'],
    [new Error('net::ERR_NAME_NOT_RESOLVED'), 'asset_unavailable'],
    [new Error('renderer crashed'), 'renderer_failed'],
  ])('classifies %s as %s', (error, reason) => {
    expect(classifyEditorRenderError(error)).toMatchObject({ reason });
  });

  it('never exposes the renderer error content', () => {
    const classified = classifyEditorRenderError(
      new Error('Failed to fetch https://cdn.example/private-video.mp4'),
    );

    expect(classified.publicMessage).toBe(
      'A required render asset could not be loaded.',
    );
    expect(classified.publicMessage).not.toContain('https://');
  });
});

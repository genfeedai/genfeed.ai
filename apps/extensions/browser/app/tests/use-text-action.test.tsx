import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTextAction } from '~hooks/use-text-action';
import { usePlatformStore } from '~store/use-platform-store';

const RESULT = {
  hasBrandVoice: true,
  isReplayed: false,
  maxCharacters: 280,
  mode: 'rewrite',
  platform: 'twitter',
  text: 'The launch is live',
};

const send = vi.mocked(chrome.runtime.sendMessage);

function route(handlers: Record<string, unknown>): void {
  send.mockImplementation((async (message: {
    event: string;
    payload?: { type?: string };
  }) => {
    const key = message.payload?.type ?? message.event;
    return handlers[key];
  }) as never);
}

const CAPTURED = {
  scope: 'draft',
  snapshotId: 'snapshot-1',
  success: true,
  text: 'Teh launch is live',
};

describe('useTextAction', () => {
  beforeEach(() => {
    usePlatformStore.setState({ currentPlatform: 'twitter' });
    send.mockReset();
  });

  afterEach(cleanup);

  it('captures the page draft, edits it and previews without applying', async () => {
    route({
      CAPTURE_COMPOSER_TEXT: CAPTURED,
      refineText: { result: RESULT, success: true },
    });
    const { result } = renderHook(useTextAction);

    await act(() => result.current.start('rewrite'));

    expect(result.current).toMatchObject({
      original: 'Teh launch is live',
      phase: 'preview',
      result: RESULT,
      snapshotId: 'snapshot-1',
    });
    expect(send).toHaveBeenCalledWith({
      event: 'RELAY_TO_CONTENT',
      payload: { type: 'CAPTURE_COMPOSER_TEXT' },
    });
    expect(send).toHaveBeenCalledWith({
      event: 'refineText',
      mode: 'rewrite',
      platform: 'twitter',
      requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      text: 'Teh launch is live',
    });
    expect(send).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ type: 'APPLY_COMPOSER_TEXT' }),
      }),
    );
  });

  it('applies and undoes through the page by snapshot id', async () => {
    route({
      APPLY_COMPOSER_TEXT: { success: true },
      CAPTURE_COMPOSER_TEXT: CAPTURED,
      UNDO_COMPOSER_TEXT: { success: true },
      refineText: { result: RESULT, success: true },
    });
    const { result } = renderHook(useTextAction);
    await act(() => result.current.start('rewrite'));

    await act(() => result.current.apply());
    expect(result.current.phase).toBe('applied');
    expect(send).toHaveBeenCalledWith({
      event: 'RELAY_TO_CONTENT',
      payload: {
        snapshotId: 'snapshot-1',
        text: 'The launch is live',
        type: 'APPLY_COMPOSER_TEXT',
      },
    });

    await act(() => result.current.undo());
    expect(result.current.phase).toBe('preview');
    expect(send).toHaveBeenCalledWith({
      event: 'RELAY_TO_CONTENT',
      payload: { snapshotId: 'snapshot-1', type: 'UNDO_COMPOSER_TEXT' },
    });
  });

  it('keeps the suggestion and shows why when Apply is refused', async () => {
    route({
      APPLY_COMPOSER_TEXT: {
        error: 'Your draft changed since the preview. Run the action again.',
        success: false,
      },
      CAPTURE_COMPOSER_TEXT: CAPTURED,
      refineText: { result: RESULT, success: true },
    });
    const { result } = renderHook(useTextAction);
    await act(() => result.current.start('rewrite'));

    await act(() => result.current.apply());

    expect(result.current.phase).toBe('preview');
    expect(result.current.result).toEqual(RESULT);
    expect(result.current.error).toContain('draft changed');
  });

  it('shows the capture error and never calls the background', async () => {
    route({
      CAPTURE_COMPOSER_TEXT: {
        error: 'Open the composer you want to edit first.',
        success: false,
      },
    });
    const { result } = renderHook(useTextAction);

    await act(() => result.current.start('proofread'));

    expect(result.current).toMatchObject({
      error: 'Open the composer you want to edit first.',
      phase: 'idle',
    });
    expect(send).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'refineText' }),
    );
  });

  it('shows the action error and offers no preview', async () => {
    route({
      CAPTURE_COMPOSER_TEXT: CAPTURED,
      refineText: { error: 'Not enough credits.', success: false },
    });
    const { result } = renderHook(useTextAction);

    await act(() => result.current.start('rewrite'));

    expect(result.current).toMatchObject({
      error: 'Not enough credits.',
      phase: 'idle',
      result: null,
    });
  });

  it('needs a supported site', async () => {
    usePlatformStore.setState({ currentPlatform: null });
    const { result } = renderHook(useTextAction);

    await act(() => result.current.start('rewrite'));

    expect(result.current.error).toBe(
      'Open a supported site and its composer first.',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('ignores a second start while one is running', async () => {
    send.mockImplementation((() => new Promise(() => undefined)) as never);
    const { result } = renderHook(useTextAction);

    act(() => {
      void result.current.start('rewrite');
    });
    await act(() => result.current.start('proofread'));

    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('working');
  });

  it('dismisses back to idle', async () => {
    route({
      CAPTURE_COMPOSER_TEXT: CAPTURED,
      refineText: { result: RESULT, success: true },
    });
    const { result } = renderHook(useTextAction);
    await act(() => result.current.start('rewrite'));

    act(() => result.current.dismiss());

    expect(result.current).toMatchObject({ phase: 'idle', result: null });
  });
});

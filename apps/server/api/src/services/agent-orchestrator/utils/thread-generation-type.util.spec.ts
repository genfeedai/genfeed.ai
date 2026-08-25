import {
  generationTypeLockError,
  resolveLockedGenerationType,
} from '@api/services/agent-orchestrator/utils/thread-generation-type.util';
import { describe, expect, it } from 'vitest';

describe('resolveLockedGenerationType', () => {
  it('locks to the first generation card in chronological metadata', () => {
    expect(
      resolveLockedGenerationType([
        {
          uiActions: [
            {
              generationType: 'image',
              id: 'generation-image',
              type: 'generation_action_card',
            },
          ],
        },
        {
          uiActions: [
            {
              generationType: 'video',
              id: 'generation-video',
              type: 'generation_action_card',
            },
          ],
        },
      ]),
    ).toBe('image');
  });

  it('ignores non-generation cards', () => {
    expect(
      resolveLockedGenerationType([
        { uiActions: [{ id: 'preview', type: 'content_preview_card' }] },
      ]),
    ).toBeNull();
  });
});

describe('generationTypeLockError', () => {
  it('refuses video in an image conversation', () => {
    expect(generationTypeLockError('video', 'image')).toBe(
      'This conversation is for image generation. Start a new chat to generate video.',
    );
  });

  it('allows the first generate and matching follow-ups', () => {
    expect(generationTypeLockError('image', null)).toBeNull();
    expect(generationTypeLockError('video', 'video')).toBeNull();
  });
});

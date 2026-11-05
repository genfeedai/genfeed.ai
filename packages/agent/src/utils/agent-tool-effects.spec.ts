import {
  LIBRARY_ASSETS_REFRESH_EVENT,
  PUBLISHING_CONTENT_REFRESH_EVENT,
} from '@genfeedai/contracts/constants';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dispatchAgentToolEffects } from './agent-tool-effects';

const LIBRARY = LIBRARY_ASSETS_REFRESH_EVENT;
const PUBLISHING = PUBLISHING_CONTENT_REFRESH_EVENT;

describe('dispatchAgentToolEffects', () => {
  /** The refresh events the open page receives, in order. */
  let received: string[];
  const record = (event: Event) => received.push(event.type);

  beforeEach(() => {
    received = [];
    window.addEventListener(LIBRARY, record);
    window.addEventListener(PUBLISHING, record);
  });

  afterEach(() => {
    window.removeEventListener(LIBRARY, record);
    window.removeEventListener(PUBLISHING, record);
  });

  it.each([
    [
      'one Publishing reload for a run of post tools',
      [
        { status: 'completed', toolName: 'get_posts' },
        { status: 'completed', toolName: 'create_post' },
        { status: 'completed', toolName: 'schedule_post' },
      ],
      [PUBLISHING],
    ],
    [
      'one Library reload for repeated stars',
      [
        { status: 'completed', toolName: 'get_assets' },
        { status: 'completed', toolName: 'star_asset' },
        { status: 'completed', toolName: 'star_asset' },
      ],
      [LIBRARY],
    ],
    [
      'both reloads when a run changed posts and assets',
      [
        { status: 'completed', toolName: 'transform_media' },
        { status: 'completed', toolName: 'draft_thread' },
      ],
      [PUBLISHING, LIBRARY],
    ],
    [
      'nothing for a star that failed',
      [{ status: 'failed', toolName: 'star_asset' }],
      [],
    ],
    [
      'nothing for a post tool that failed',
      [{ status: 'failed', toolName: 'schedule_post' }],
      [],
    ],
    [
      'nothing for read-only tools',
      [
        { status: 'completed', toolName: 'get_posts' },
        { status: 'completed', toolName: 'get_assets' },
      ],
      [],
    ],
    ['nothing for an empty run', [], []],
    ['nothing for a run without tool calls', undefined, []],
  ])('sends %s', (_label, toolCalls, expected) => {
    dispatchAgentToolEffects(toolCalls);

    expect(received).toEqual(expected);
  });
});

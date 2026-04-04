import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getComposerState,
  insertAndPublishContent,
  insertContentIntoComposer,
  publishComposer,
} from '~platforms/composer-helpers';

const BASE_PLATFORM = {
  constructPostUrl: () => '',
  extractPostId: () => null,
  hostnames: ['twitter.com'],
  name: 'Twitter/X',
  platform: 'TWITTER',
  selectors: {
    actionsContainer: '[role="group"]',
    postContainer: 'article',
    postIdentifier: 'article',
    replyTextarea: '#composer',
    submitButton: '#submit',
  },
} as never;

describe('composer-helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('reads composer state from detected elements', () => {
    document.body.innerHTML = `
      <textarea id="composer"></textarea>
      <button id="submit">Post</button>
    `;

    const state = getComposerState(BASE_PLATFORM);

    expect(state.composeBoxAvailable).toBe(true);
    expect(state.submitButtonAvailable).toBe(true);
    expect(state.canSubmit).toBe(true);
  });

  it('inserts content into textarea composer', () => {
    document.body.innerHTML = `
      <textarea id="composer"></textarea>
      <button id="submit">Post</button>
    `;

    const result = insertContentIntoComposer('Hello world', BASE_PLATFORM);
    const textarea = document.getElementById('composer') as HTMLTextAreaElement;

    expect(result.success).toBe(true);
    expect(textarea.value).toBe('Hello world');
  });

  it('inserts content into contenteditable composer', () => {
    document.body.innerHTML = `
      <div id="composer" contenteditable="true"></div>
      <button id="submit">Post</button>
    `;

    const result = insertContentIntoComposer('Editable text', BASE_PLATFORM);
    const composer = document.getElementById('composer');

    expect(result.success).toBe(true);
    expect(composer?.textContent).toBe('Editable text');
  });

  it('publishes via submit button click when enabled', () => {
    document.body.innerHTML = `
      <textarea id="composer"></textarea>
      <button id="submit">Post</button>
    `;

    const clickSpy = vi.spyOn(HTMLButtonElement.prototype, 'click');

    const result = publishComposer(BASE_PLATFORM);

    expect(result.success).toBe(true);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('returns error when publish button is disabled', () => {
    document.body.innerHTML = `
      <textarea id="composer"></textarea>
      <button id="submit" disabled>Post</button>
    `;

    const result = publishComposer(BASE_PLATFORM);

    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  });

  it('insertAndPublishContent runs insert then publish', () => {
    document.body.innerHTML = `
      <textarea id="composer"></textarea>
      <button id="submit">Post</button>
    `;

    const result = insertAndPublishContent('Ship this', BASE_PLATFORM);
    const textarea = document.getElementById('composer') as HTMLTextAreaElement;

    expect(result.success).toBe(true);
    expect(textarea.value).toBe('Ship this');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getComposerState,
  insertContentIntoComposer,
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
});

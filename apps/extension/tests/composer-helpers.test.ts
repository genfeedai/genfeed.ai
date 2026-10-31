import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  activateComposer,
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

  it('replaces the existing text by selecting it, so rich editors keep their own state', () => {
    document.body.innerHTML = `
      <div id="composer" contenteditable="true">Old draft</div>
    `;
    const composer = document.getElementById('composer') as HTMLElement;
    const selected: string[] = [];
    // The page editor applies the command the way a real editor would.
    const execCommand = vi.fn(
      (command: string, _showUi?: boolean, value?: string) => {
        selected.push(window.getSelection()?.toString() ?? '');
        composer.textContent = String(value);
        return command === 'insertText';
      },
    );
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });

    const result = insertContentIntoComposer('New reply', BASE_PLATFORM);
    Reflect.deleteProperty(document, 'execCommand');

    expect(result.success).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('insertText', false, 'New reply');
    expect(selected).toEqual(['Old draft']);
    expect(composer.textContent).toBe('New reply');
  });

  it('writes a React-controlled textarea through the native setter', () => {
    document.body.innerHTML = '<textarea id="composer"></textarea>';
    const textarea = document.getElementById('composer') as HTMLTextAreaElement;
    const input = vi.fn();
    textarea.addEventListener('input', input);

    expect(insertContentIntoComposer('A reply', BASE_PLATFORM).success).toBe(
      true,
    );

    expect(textarea.value).toBe('A reply');
    expect(input).toHaveBeenCalled();
  });

  it('reports an editor that ignores the write', () => {
    document.body.innerHTML = `<div id="composer" contenteditable="true"></div>`;
    const composer = document.getElementById('composer') as HTMLElement;
    composer.addEventListener('input', () => {
      composer.textContent = '';
    });

    expect(insertContentIntoComposer('A reply', BASE_PLATFORM)).toEqual({
      error: 'The page did not accept the edit. Copy the text instead.',
      success: false,
    });
  });

  it('tells the user how to reach a missing reply box', () => {
    const result = insertContentIntoComposer('A reply', BASE_PLATFORM);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Click Reply on the post first');
  });

  describe('activateComposer', () => {
    const YOUTUBE = {
      ...(BASE_PLATFORM as object),
      selectors: {
        ...(BASE_PLATFORM as { selectors: object }).selectors,
        replyActivator: '#simplebox-placeholder',
        replyTextarea: '#contenteditable-root',
      },
    } as never;

    it('opens a collapsed reply box and waits for the composer', async () => {
      document.body.innerHTML =
        '<div id="simplebox-placeholder">Add a comment</div>';
      document
        .getElementById('simplebox-placeholder')
        ?.addEventListener('click', () => {
          setTimeout(() => {
            document.body.insertAdjacentHTML(
              'beforeend',
              '<div id="contenteditable-root" contenteditable="true"></div>',
            );
          }, 20);
        });

      await expect(activateComposer(YOUTUBE)).resolves.toBe(true);
      expect(insertContentIntoComposer('Nice video', YOUTUBE).success).toBe(
        true,
      );
      expect(document.getElementById('contenteditable-root')?.textContent).toBe(
        'Nice video',
      );
    });

    it('leaves an open composer alone', async () => {
      document.body.innerHTML = `
        <div id="simplebox-placeholder">Add a comment</div>
        <div id="contenteditable-root" contenteditable="true"></div>`;
      const click = vi.fn();
      document
        .getElementById('simplebox-placeholder')
        ?.addEventListener('click', click);

      await expect(activateComposer(YOUTUBE)).resolves.toBe(true);
      expect(click).not.toHaveBeenCalled();
    });

    it('gives up when there is nothing to open or nothing opens', async () => {
      await expect(activateComposer(YOUTUBE)).resolves.toBe(false);
      document.body.innerHTML =
        '<div id="simplebox-placeholder">Add a comment</div>';
      await expect(activateComposer(YOUTUBE, 60)).resolves.toBe(false);
      await expect(activateComposer(null)).resolves.toBe(false);
    });

    it('never submits: only the opener is clicked', async () => {
      document.body.innerHTML = `
        <div id="simplebox-placeholder">Add a comment</div>
        <button id="submit">Comment</button>`;
      const submit = vi.fn();
      document.getElementById('submit')?.addEventListener('click', submit);

      await activateComposer(YOUTUBE, 60);

      expect(submit).not.toHaveBeenCalled();
    });
  });
});

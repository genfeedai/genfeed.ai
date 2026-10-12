import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyComposerText,
  captureComposerText,
  undoComposerText,
} from '~platforms/composer-helpers';
import {
  findTextActionSession,
  registerTextActionSession,
  TextActionSession,
} from '~platforms/text-action-session';

const PLATFORM = {
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

function selectText(node: Node, start: number, end: number): void {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function captured(platform = PLATFORM) {
  const result = captureComposerText(platform);
  if (!result.success) throw new Error(result.error);
  return result.snapshot;
}

describe('text action composer capture and replacement', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  describe('a textarea composer', () => {
    function textarea(value: string): HTMLTextAreaElement {
      document.body.innerHTML = '<textarea id="composer"></textarea>';
      const element = document.getElementById(
        'composer',
      ) as HTMLTextAreaElement;
      element.value = value;
      return element;
    }

    it('captures the whole draft when nothing is selected', () => {
      textarea('Teh launch is live');
      expect(captured()).toMatchObject({
        draft: 'Teh launch is live',
        scope: 'draft',
        text: 'Teh launch is live',
      });
    });

    it('captures only the selected text', () => {
      const element = textarea('Intro. Teh launch is live. Outro.');
      element.setSelectionRange(7, 25);
      expect(captured()).toMatchObject({
        scope: 'selection',
        selection: { end: 25, start: 7 },
        text: 'Teh launch is live',
      });
    });

    it('replaces the selection and keeps the rest of the draft', () => {
      const element = textarea('Intro. Teh launch is live. Outro.');
      element.setSelectionRange(7, 25);
      const input = vi.fn();
      element.addEventListener('input', input);

      const written = applyComposerText(captured(), 'The launch is live');

      expect(written.success).toBe(true);
      expect(element.value).toBe('Intro. The launch is live. Outro.');
      expect(input).toHaveBeenCalled();
    });

    it('replaces the whole draft when nothing was selected', () => {
      const element = textarea('Teh launch');
      expect(applyComposerText(captured(), 'The launch').success).toBe(true);
      expect(element.value).toBe('The launch');
    });

    it('refuses to overwrite a draft the user edited after the preview', () => {
      const element = textarea('Teh launch');
      const snapshot = captured();
      element.value = 'Teh launch, edited since';

      expect(applyComposerText(snapshot, 'The launch')).toEqual({
        error: 'Your draft changed since the preview. Run the action again.',
        success: false,
      });
      expect(element.value).toBe('Teh launch, edited since');
    });

    it('undoes an apply while the draft is as it was left', () => {
      const element = textarea('Intro. Teh launch is live. Outro.');
      element.setSelectionRange(7, 25);
      const written = applyComposerText(captured(), 'The launch is live');
      if (!written.success) throw new Error(written.error);

      expect(undoComposerText(written.applied)).toEqual({ success: true });
      expect(element.value).toBe('Intro. Teh launch is live. Outro.');
    });

    it('does not undo over text typed after the apply', () => {
      const element = textarea('Teh launch');
      const written = applyComposerText(captured(), 'The launch');
      if (!written.success) throw new Error(written.error);
      element.value = 'The launch, and more';

      expect(undoComposerText(written.applied)).toEqual({
        error: 'Your draft changed after Apply, so Undo would overwrite it.',
        success: false,
      });
      expect(element.value).toBe('The launch, and more');
    });
  });

  describe('a contenteditable composer', () => {
    function editable(text: string): HTMLElement {
      document.body.innerHTML = `<div id="composer" contenteditable="true"></div>`;
      const element = document.getElementById('composer') as HTMLElement;
      element.textContent = text;
      return element;
    }

    it('captures the selection inside the composer', () => {
      const element = editable('Intro. Teh launch is live. Outro.');
      selectText(element.firstChild as Text, 7, 25);
      expect(captured()).toMatchObject({
        draft: 'Intro. Teh launch is live. Outro.',
        scope: 'selection',
        text: 'Teh launch is live',
      });
    });

    it('ignores a selection outside the composer', () => {
      editable('Teh launch');
      document.body.insertAdjacentHTML(
        'beforeend',
        '<p id="page">Page text</p>',
      );
      selectText(document.getElementById('page')?.firstChild as Text, 0, 4);
      expect(captured()).toMatchObject({ scope: 'draft', text: 'Teh launch' });
    });

    it('replaces the selection, then restores the draft on undo', () => {
      const element = editable('Intro. Teh launch is live. Outro.');
      selectText(element.firstChild as Text, 7, 25);
      const written = applyComposerText(captured(), 'The launch is live');
      if (!written.success) throw new Error(written.error);

      expect(element.textContent).toBe('Intro. The launch is live. Outro.');
      expect(undoComposerText(written.applied)).toEqual({ success: true });
      expect(element.textContent).toBe('Intro. Teh launch is live. Outro.');
    });

    it('replaces the whole draft when nothing is selected', () => {
      const element = editable('Teh launch');
      expect(applyComposerText(captured(), 'The launch').success).toBe(true);
      expect(element.textContent).toBe('The launch');
    });

    it('reports an editor that ignores the write instead of claiming success', () => {
      const element = editable('Teh launch');
      const original = element.textContent as string;
      element.addEventListener('input', () => {
        element.textContent = original;
      });

      expect(applyComposerText(captured(), 'The launch')).toEqual({
        error: 'The page did not accept the edit. Copy the text instead.',
        success: false,
      });
    });

    it('finds the editable inside a wrapper composer', () => {
      document.body.innerHTML =
        '<div id="composer"><div contenteditable="true" id="inner">Teh</div></div>';
      expect(captured().element.id).toBe('inner');
    });
  });

  describe('capture limits', () => {
    it('asks for a composer when the page has none', () => {
      expect(captureComposerText(PLATFORM)).toEqual({
        error: 'Open the composer you want to edit first.',
        success: false,
      });
    });

    it('asks for text when the composer is empty', () => {
      document.body.innerHTML = '<textarea id="composer"></textarea>';
      expect(captureComposerText(PLATFORM)).toEqual({
        error: 'Write or select some text first.',
        success: false,
      });
    });

    it('prefers the focused composer when the page has several', () => {
      document.body.innerHTML = `
        <textarea id="composer">first</textarea>
        <textarea id="composer">second</textarea>`;
      const second = document.querySelectorAll('textarea')[1];
      second.focus();
      expect(captured().text).toBe('second');
    });
  });

  describe('sessions', () => {
    it('applies once, undoes that apply and forgets it', () => {
      document.body.innerHTML = '<textarea id="composer">Teh</textarea>';
      const session = new TextActionSession(captured());

      expect(session.undo()).toEqual({
        error: 'There is nothing to undo.',
        success: false,
      });
      expect(session.apply('The').success).toBe(true);
      expect(session.undo()).toEqual({ success: true });
      expect(session.undo().success).toBe(false);
    });

    it('hands the panel an id and keeps only the latest sessions', () => {
      document.body.innerHTML = '<textarea id="composer">Teh</textarea>';
      const first = new TextActionSession(captured());
      const firstId = registerTextActionSession(first);
      expect(findTextActionSession(firstId)).toBe(first);
      for (let index = 0; index < 5; index += 1) {
        registerTextActionSession(new TextActionSession(captured()));
      }
      expect(findTextActionSession(firstId)).toBeUndefined();
      expect(findTextActionSession(undefined)).toBeUndefined();
    });
  });
});

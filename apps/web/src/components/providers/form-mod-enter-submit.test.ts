import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  findSubmittableForm,
  handleFormModEnterSubmit,
  isModEnterKey,
} from './form-mod-enter-submit';

function mountForm(html: string): HTMLFormElement {
  document.body.innerHTML = html;
  const form = document.querySelector('form');
  if (!(form instanceof HTMLFormElement)) {
    throw new Error('Expected a form in the fixture');
  }
  return form;
}

function keyEvent(
  init: Partial<KeyboardEvent> & { key?: string } = {},
): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
    metaKey: true,
    ...init,
  });
}

describe('isModEnterKey', () => {
  it('accepts meta/ctrl + Enter', () => {
    expect(isModEnterKey({ key: 'Enter', metaKey: true, ctrlKey: false })).toBe(
      true,
    );
    expect(isModEnterKey({ key: 'Enter', metaKey: false, ctrlKey: true })).toBe(
      true,
    );
  });

  it('rejects plain Enter, other keys, composing, and defaultPrevented', () => {
    expect(
      isModEnterKey({ key: 'Enter', metaKey: false, ctrlKey: false }),
    ).toBe(false);
    expect(isModEnterKey({ key: 'a', metaKey: true, ctrlKey: false })).toBe(
      false,
    );
    expect(
      isModEnterKey({
        key: 'Enter',
        metaKey: true,
        ctrlKey: false,
        isComposing: true,
      }),
    ).toBe(false);
    expect(
      isModEnterKey({
        key: 'Enter',
        metaKey: true,
        ctrlKey: false,
        defaultPrevented: true,
      }),
    ).toBe(false);
    expect(
      isModEnterKey({
        key: 'Enter',
        metaKey: true,
        ctrlKey: false,
        repeat: true,
      }),
    ).toBe(false);
  });
});

describe('findSubmittableForm', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the nearest form when an enabled submit control exists', () => {
    const form = mountForm(`
      <form>
        <input type="email" name="email" />
        <button type="submit">Send</button>
      </form>
    `);
    const input = form.querySelector('input');
    expect(findSubmittableForm(input)).toBe(form);
  });

  it('returns null when the submit control is disabled', () => {
    const form = mountForm(`
      <form>
        <input type="email" name="email" />
        <button type="submit" disabled>Send</button>
      </form>
    `);
    expect(findSubmittableForm(form.querySelector('input'))).toBeNull();
  });

  it('returns null for contenteditable targets and non-form targets', () => {
    document.body.innerHTML = `
      <div contenteditable="true">hello</div>
      <input type="text" />
    `;
    const editable = document.querySelector('[contenteditable]');
    const looseInput = document.querySelector('input');
    expect(findSubmittableForm(editable)).toBeNull();
    expect(findSubmittableForm(looseInput)).toBeNull();
  });

  it('honors data-mod-enter-submit="false" opt-out', () => {
    const form = mountForm(`
      <form data-mod-enter-submit="false">
        <input type="email" name="email" />
        <button type="submit">Send</button>
      </form>
    `);
    expect(findSubmittableForm(form.querySelector('input'))).toBeNull();
  });
});

describe('handleFormModEnterSubmit', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('passes the enabled submitter to requestSubmit', () => {
    const form = mountForm(`
      <form>
        <input type="email" name="email" value="a@b.co" />
        <button type="submit" name="intent" value="draft" disabled>
          Save draft
        </button>
        <button
          type="submit"
          name="intent"
          value="publish"
          formaction="/publishing"
          formmethod="post"
        >
          Publish
        </button>
      </form>
    `);
    const input = form.querySelector('input');
    const submitter = form.querySelector('button:not(:disabled)');
    if (!input || !submitter) {
      throw new Error('missing form control');
    }

    const requestSubmit = vi.fn();
    form.requestSubmit = requestSubmit;

    const event = keyEvent({ metaKey: true });
    Object.defineProperty(event, 'target', { value: input });
    const preventDefault = vi.spyOn(event, 'preventDefault');

    expect(handleFormModEnterSubmit(event)).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(requestSubmit).toHaveBeenCalledWith(submitter);
    expect(submitter).toHaveAttribute('name', 'intent');
    expect(submitter).toHaveAttribute('value', 'publish');
    expect(submitter).toHaveAttribute('formaction', '/publishing');
    expect(submitter).toHaveAttribute('formmethod', 'post');
  });

  it('ignores repeated mod+Enter keydown events', () => {
    const form = mountForm(`
      <form>
        <input type="email" name="email" />
        <button type="submit">Send</button>
      </form>
    `);
    const input = form.querySelector('input');
    if (!input) {
      throw new Error('missing input');
    }

    const requestSubmit = vi.fn();
    form.requestSubmit = requestSubmit;

    const event = keyEvent({ repeat: true });
    Object.defineProperty(event, 'target', { value: input });

    expect(handleFormModEnterSubmit(event)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(requestSubmit).not.toHaveBeenCalled();
  });

  it('does not submit on plain Enter', () => {
    const form = mountForm(`
      <form>
        <input type="email" name="email" />
        <button type="submit">Send</button>
      </form>
    `);
    const input = form.querySelector('input');
    if (!input) {
      throw new Error('missing input');
    }

    const requestSubmit = vi.fn();
    form.requestSubmit = requestSubmit;

    const event = keyEvent({ metaKey: false, ctrlKey: false });
    Object.defineProperty(event, 'target', { value: input });

    expect(handleFormModEnterSubmit(event)).toBe(false);
    expect(requestSubmit).not.toHaveBeenCalled();
  });
});

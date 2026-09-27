import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppRailShortcutHandler } from './app-rail.shortcuts';

afterEach(() => {
  document.body.replaceChildren();
});

describe('app rail keyboard shortcuts', () => {
  it('requires G then a number within one second and consumes the sequence', () => {
    let time = 0;
    const navigate = vi.fn(() => true);
    const { handleKeyDown } = createAppRailShortcutHandler(
      false,
      navigate,
      () => time,
    );
    handleKeyDown(new KeyboardEvent('keydown', { key: '1' }));
    expect(navigate).not.toHaveBeenCalled();
    handleKeyDown(new KeyboardEvent('keydown', { key: 'g' }));
    time = 1000;
    const number = new KeyboardEvent('keydown', { key: '9', cancelable: true });
    handleKeyDown(number);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(8);
    expect(number.defaultPrevented).toBe(true);
    handleKeyDown(new KeyboardEvent('keydown', { key: '2' }));
    handleKeyDown(new KeyboardEvent('keydown', { key: 'g' }));
    time = 2001;
    handleKeyDown(new KeyboardEvent('keydown', { key: '3' }));
    expect(navigate).toHaveBeenCalledOnce();
  });

  it.each([
    'input',
    'textarea',
    'select',
    'contenteditable',
    'nested-contenteditable',
  ])('suppresses sequences in %s', (kind) => {
    const navigate = vi.fn(() => true);
    const { handleKeyDown } = createAppRailShortcutHandler(false, navigate);
    const root = document.createElement(
      kind.includes('contenteditable') ? 'div' : kind,
    );
    if (kind.includes('contenteditable'))
      root.setAttribute('contenteditable', 'true');
    const target =
      kind === 'nested-contenteditable'
        ? root.appendChild(document.createElement('span'))
        : root;
    document.body.appendChild(root);
    document.addEventListener('keydown', handleKeyDown);
    try {
      handleKeyDown(new KeyboardEvent('keydown', { key: 'g' }));
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: '1', bubbles: true }),
      );
      handleKeyDown(new KeyboardEvent('keydown', { key: '2' }));
      expect(navigate).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', handleKeyDown);
    }
  });

  it.each(['metaKey', 'ctrlKey', 'altKey', 'shiftKey'])(
    'ignores web sequences with %s',
    (modifier) => {
      const navigate = vi.fn(() => true);
      const { handleKeyDown } = createAppRailShortcutHandler(false, navigate);
      handleKeyDown(new KeyboardEvent('keydown', { key: 'g' }));
      handleKeyDown(
        new KeyboardEvent('keydown', { key: '1', [modifier]: true }),
      );
      handleKeyDown(new KeyboardEvent('keydown', { key: '2' }));
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it('cancels on unrelated keys, focus reset, composition, repeat, and handled events', () => {
    const navigate = vi.fn(() => true);
    const { handleKeyDown, reset } = createAppRailShortcutHandler(
      false,
      navigate,
    );
    for (const init of [
      { key: 'x' },
      { key: '1', isComposing: true },
      { key: '1', repeat: true },
    ]) {
      handleKeyDown(new KeyboardEvent('keydown', { key: 'g' }));
      handleKeyDown(new KeyboardEvent('keydown', init));
      handleKeyDown(new KeyboardEvent('keydown', { key: '1' }));
    }
    handleKeyDown(new KeyboardEvent('keydown', { key: 'g' }));
    reset();
    handleKeyDown(new KeyboardEvent('keydown', { key: '1' }));
    const handled = new KeyboardEvent('keydown', {
      key: 'g',
      cancelable: true,
    });
    handled.preventDefault();
    handleKeyDown(handled);
    handleKeyDown(new KeyboardEvent('keydown', { key: '1' }));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('suppresses desktop shortcuts while editing', () => {
    const navigate = vi.fn(() => true);
    const { handleKeyDown } = createAppRailShortcutHandler(true, navigate);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.addEventListener('keydown', handleKeyDown);
    const event = new KeyboardEvent('keydown', {
      key: '1',
      metaKey: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    expect(navigate).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves Cmd+B to the existing sidebar handler', () => {
    for (const isDesktop of [true, false]) {
      const navigate = vi.fn(() => true);
      const { handleKeyDown } = createAppRailShortcutHandler(
        isDesktop,
        navigate,
      );
      const event = new KeyboardEvent('keydown', {
        key: 'b',
        metaKey: true,
        cancelable: true,
      });
      handleKeyDown(event);
      expect(event.defaultPrevented).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    }
  });

  it('uses only Cmd+number in desktop clients and leaves unavailable numbers untouched', () => {
    const navigate = vi.fn((index: number) => index === 0);
    const { handleKeyDown } = createAppRailShortcutHandler(true, navigate);
    for (const init of [
      { key: 'g' },
      { key: '1' },
      { key: '1', ctrlKey: true },
      { key: '1', metaKey: true, altKey: true },
    ])
      handleKeyDown(new KeyboardEvent('keydown', init));
    expect(navigate).not.toHaveBeenCalled();
    const accepted = new KeyboardEvent('keydown', {
      key: '1',
      metaKey: true,
      cancelable: true,
    });
    handleKeyDown(accepted);
    expect(accepted.defaultPrevented).toBe(true);
    const unavailable = new KeyboardEvent('keydown', {
      key: '9',
      metaKey: true,
      cancelable: true,
    });
    handleKeyDown(unavailable);
    expect(unavailable.defaultPrevented).toBe(false);
  });
});

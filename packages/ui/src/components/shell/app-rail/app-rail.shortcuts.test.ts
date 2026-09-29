import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppRailShortcutHandler } from './app-rail.shortcuts';

afterEach(() => {
  document.body.replaceChildren();
});

describe('app rail keyboard shortcuts', () => {
  it('arms the web sequence when a non-KeyG key types g', () => {
    const navigate = vi.fn(() => true);
    const { handleKeyDown } = createAppRailShortcutHandler(false, navigate);
    handleKeyDown(new KeyboardEvent('keydown', { code: 'KeyT', key: 'g' }));
    expect(navigate).not.toHaveBeenCalled();
    const event = new KeyboardEvent('keydown', {
      code: 'Digit1',
      key: '1',
      cancelable: true,
    });
    handleKeyDown(event);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(0);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([false, true])('accepts Numpad1 for desktop=%s', (isDesktop) => {
    const navigate = vi.fn(() => true);
    const { handleKeyDown } = createAppRailShortcutHandler(isDesktop, navigate);
    if (!isDesktop)
      handleKeyDown(new KeyboardEvent('keydown', { code: 'KeyG', key: 'g' }));
    const event = new KeyboardEvent('keydown', {
      code: 'Numpad1',
      key: '1',
      metaKey: isDesktop,
      cancelable: true,
    });
    handleKeyDown(event);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(0);
    expect(event.defaultPrevented).toBe(true);
  });

  it('requires G then a number within one second and consumes the sequence', () => {
    let time = 0;
    const navigate = vi.fn(() => true);
    const { handleKeyDown } = createAppRailShortcutHandler(
      false,
      navigate,
      () => time,
    );
    handleKeyDown(new KeyboardEvent('keydown', { code: 'Digit1', key: '1' }));
    expect(navigate).not.toHaveBeenCalled();
    handleKeyDown(new KeyboardEvent('keydown', { code: 'KeyG', key: 'g' }));
    time = 1000;
    const number = new KeyboardEvent('keydown', {
      code: 'Digit9',
      key: '9',
      cancelable: true,
    });
    handleKeyDown(number);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(8);
    expect(number.defaultPrevented).toBe(true);
    handleKeyDown(new KeyboardEvent('keydown', { code: 'Digit2', key: '2' }));
    handleKeyDown(new KeyboardEvent('keydown', { code: 'KeyG', key: 'g' }));
    time = 2001;
    handleKeyDown(new KeyboardEvent('keydown', { code: 'Digit3', key: '3' }));
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
      handleKeyDown(new KeyboardEvent('keydown', { code: 'KeyG', key: 'g' }));
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          code: 'Digit1',
          key: '1',
          bubbles: true,
        }),
      );
      handleKeyDown(new KeyboardEvent('keydown', { code: 'Digit2', key: '2' }));
      expect(navigate).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', handleKeyDown);
    }
  });

  it('suppresses desktop shortcuts while editing', () => {
    const navigate = vi.fn(() => true);
    const { handleKeyDown } = createAppRailShortcutHandler(true, navigate);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.addEventListener('keydown', handleKeyDown);
    const event = new KeyboardEvent('keydown', {
      code: 'Digit1',
      key: '1',
      metaKey: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    expect(navigate).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it.each(['menu', 'menubar', 'listbox', 'dialog', 'alertdialog', 'combobox'])(
    'ignores shortcuts inside a %s and resets the web sequence',
    (role) => {
      const root = document.createElement('div');
      root.setAttribute('role', role);
      const target = root.appendChild(document.createElement('span'));
      document.body.appendChild(root);
      for (const isDesktop of [false, true]) {
        const navigate = vi.fn(() => true);
        const { handleKeyDown } = createAppRailShortcutHandler(
          isDesktop,
          navigate,
        );
        document.addEventListener('keydown', handleKeyDown);
        try {
          handleKeyDown(
            new KeyboardEvent('keydown', { code: 'KeyG', key: 'g' }),
          );
          const event = new KeyboardEvent('keydown', {
            code: 'Digit1',
            key: '&',
            metaKey: isDesktop,
            bubbles: true,
            cancelable: true,
          });
          target.dispatchEvent(event);
          expect(event.defaultPrevented).toBe(false);
          handleKeyDown(
            new KeyboardEvent('keydown', { code: 'Digit2', key: '2' }),
          );
          target.dispatchEvent(
            new KeyboardEvent('keydown', {
              code: 'KeyG',
              key: 'g',
              bubbles: true,
            }),
          );
          handleKeyDown(
            new KeyboardEvent('keydown', { code: 'Digit1', key: '1' }),
          );
          expect(navigate).not.toHaveBeenCalled();
        } finally {
          document.removeEventListener('keydown', handleKeyDown);
        }
      }
    },
  );

  it.each([false, true])(
    'uses physical digit codes for desktop=%s',
    (isDesktop) => {
      const navigate = vi.fn(() => true);
      const { handleKeyDown } = createAppRailShortcutHandler(
        isDesktop,
        navigate,
      );
      if (!isDesktop)
        handleKeyDown(new KeyboardEvent('keydown', { code: 'KeyG', key: 'g' }));
      const event = new KeyboardEvent('keydown', {
        code: 'Digit1',
        key: '&',
        metaKey: isDesktop,
        cancelable: true,
      });
      handleKeyDown(event);
      expect(navigate).toHaveBeenCalledExactlyOnceWith(0);
      expect(event.defaultPrevented).toBe(true);
    },
  );

  it('leaves Cmd+B to the existing sidebar handler', () => {
    for (const isDesktop of [true, false]) {
      const navigate = vi.fn(() => true);
      const { handleKeyDown } = createAppRailShortcutHandler(
        isDesktop,
        navigate,
      );
      const event = new KeyboardEvent('keydown', {
        code: 'KeyB',
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
      { code: 'KeyG', key: 'g' },
      { code: 'Digit1', key: '1' },
      { code: 'Digit1', key: '1', ctrlKey: true },
      { code: 'Digit1', key: '1', metaKey: true, altKey: true },
    ])
      handleKeyDown(new KeyboardEvent('keydown', init));
    expect(navigate).not.toHaveBeenCalled();
    const accepted = new KeyboardEvent('keydown', {
      code: 'Digit1',
      key: '1',
      metaKey: true,
      cancelable: true,
    });
    handleKeyDown(accepted);
    expect(accepted.defaultPrevented).toBe(true);
    const unavailable = new KeyboardEvent('keydown', {
      code: 'Digit9',
      key: '9',
      metaKey: true,
      cancelable: true,
    });
    handleKeyDown(unavailable);
    expect(unavailable.defaultPrevented).toBe(false);
  });
});

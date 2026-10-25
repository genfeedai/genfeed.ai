import { keepFocusOnSwitch } from '@ui/prompt-bars/base/keep-focus-on-switch';
import { afterEach, describe, expect, it } from 'vitest';

describe('keepFocusOnSwitch', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('leaves focus alone when another control already holds it', () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    const event = new Event('focus', { cancelable: true });

    keepFocusOnSwitch(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('lets Radix restore focus to the trigger when nothing holds it', () => {
    const event = new Event('focus', { cancelable: true });

    keepFocusOnSwitch(event);

    expect(event.defaultPrevented).toBe(false);
  });
});

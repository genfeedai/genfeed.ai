import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { currentToastText, showToast } from '~platforms/ui/toast';

describe('toast', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows one message and replaces it with the next', () => {
    showToast('First');
    showToast('Second');

    expect(document.querySelectorAll('#genfeed-toast')).toHaveLength(1);
    expect(currentToastText()).toBe('Second');
  });

  it('announces an error as an alert and a note as a status', () => {
    showToast('All good');
    const status = document
      .getElementById('genfeed-toast')
      ?.shadowRoot?.querySelector('.toast');
    expect(status?.getAttribute('role')).toBe('status');

    showToast('Broke', true);
    const alert = document
      .getElementById('genfeed-toast')
      ?.shadowRoot?.querySelector('.toast');
    expect(alert?.getAttribute('role')).toBe('alert');
  });

  it('removes itself after a few seconds', () => {
    showToast('Gone soon');

    vi.advanceTimersByTime(3600);

    expect(document.getElementById('genfeed-toast')).toBeNull();
    expect(currentToastText()).toBeNull();
  });
});

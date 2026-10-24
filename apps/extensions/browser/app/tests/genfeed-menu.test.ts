import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~utils/logger.util', () => ({
  logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}));

import { createGenfeedGroup } from '~platforms/ui/menu';
import { watchContentTheme } from '~theme/content-theme';
import type { MenuGroupSpec, MenuItemSpec } from '~types/genfeed-menu';
import { logger } from '~utils/logger.util';

function item(overrides: Partial<MenuItemSpec> = {}): MenuItemSpec {
  return {
    icon: '<svg></svg>',
    id: 'generate-reply',
    label: 'Generate reply',
    run: vi.fn(),
    ...overrides,
  };
}

function groups(...specs: MenuItemSpec[]): MenuGroupSpec[] {
  return [
    { id: 'write', items: specs, label: 'Write' },
    {
      id: 'media',
      items: [
        item({ ariaLabel: 'Reply with Image', id: 'image', label: 'Image' }),
      ],
      label: 'Reply with media',
    },
  ];
}

function trigger(host: HTMLElement): HTMLButtonElement {
  return host.shadowRoot?.querySelector('button.trigger') as HTMLButtonElement;
}

function menuHost(): HTMLElement | undefined {
  return Array.from(
    document.body.querySelectorAll<HTMLElement>('[data-genfeed-host]'),
  ).find((host) => !host.hasAttribute('data-genfeed-group'));
}

function rows(): HTMLButtonElement[] {
  return Array.from(
    menuHost()?.shadowRoot?.querySelectorAll<HTMLButtonElement>('.item') ?? [],
  );
}

function mount(specs: MenuGroupSpec[]): HTMLElement {
  const host = createGenfeedGroup({ groups: specs });
  document.body.appendChild(host);
  return host;
}

describe('Genfeed button group', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is one logo-only button with an accessible name, closed at first', () => {
    const host = mount(groups(item()));

    expect(trigger(host).getAttribute('aria-label')).toBe('Genfeed actions');
    expect(trigger(host).getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger(host).getAttribute('aria-expanded')).toBe('false');
    expect(trigger(host).textContent?.trim()).toBe('');
    expect(trigger(host).querySelector('svg')).not.toBeNull();
    expect(menuHost()).toBeUndefined();
  });

  it('matches the height and corner radius of the host button', () => {
    const host = createGenfeedGroup({
      groups: groups(item()),
      skin: { height: 32, radius: 8 },
    });

    expect(host.style.getPropertyValue('--gf-height')).toBe('32px');
    expect(host.style.getPropertyValue('--gf-radius')).toBe('8px');
  });

  it('opens the menu on document.body, outside the host page container', () => {
    const host = mount(groups(item()));

    trigger(host).click();

    expect(trigger(host).getAttribute('aria-expanded')).toBe('true');
    expect(menuHost()?.parentElement).toBe(document.body);
    expect(host.contains(menuHost() ?? null)).toBe(false);
  });

  it('groups the actions under their labels', () => {
    const host = mount(groups(item()));

    trigger(host).click();

    const labels = Array.from(
      menuHost()?.shadowRoot?.querySelectorAll('.label') ?? [],
    ).map((label) => label.textContent);
    expect(labels).toEqual(['Write', 'Reply with media']);
    expect(rows().map((row) => row.textContent?.trim())).toEqual([
      'Generate reply',
      'Image',
    ]);
    expect(rows()[1].getAttribute('aria-label')).toBe('Reply with Image');
  });

  it('leaves out rows that are unavailable when the menu opens', () => {
    const host = mount(
      groups(
        item(),
        item({ id: 'save', isAvailable: () => false, label: 'Save' }),
      ),
    );

    trigger(host).click();

    const save = rows().find((row) => row.textContent?.includes('Save'));
    expect(save?.hidden).toBe(true);
  });

  it('toggles on a second click', () => {
    const host = mount(groups(item()));

    trigger(host).click();
    trigger(host).click();

    expect(menuHost()).toBeUndefined();
    expect(trigger(host).getAttribute('aria-expanded')).toBe('false');
  });

  it('runs the action and closes the menu', () => {
    const run = vi.fn();
    const host = mount(groups(item({ run })));
    trigger(host).click();

    rows()[0].click();

    return vi.waitFor(() => {
      expect(run).toHaveBeenCalledOnce();
      expect(menuHost()).toBeUndefined();
    });
  });

  it('shows progress and then restores the row', async () => {
    vi.useFakeTimers();
    const host = mount(
      groups(
        item({
          run: (controls) => {
            controls.setStatus('busy', 'Generating...');
          },
        }),
      ),
    );
    trigger(host).click();
    rows()[0].click();
    await vi.advanceTimersByTimeAsync(0);
    trigger(host).click();

    expect(rows()[0].disabled).toBe(true);
    expect(rows()[0].textContent?.trim()).toBe('Generating...');
  });

  it('puts an outcome in the row and clears it after a few seconds', async () => {
    vi.useFakeTimers();
    const host = mount(
      groups(
        item({
          run: (controls) => {
            controls.setStatus('done', 'Ready!');
          },
        }),
      ),
    );
    trigger(host).click();
    rows()[0].click();
    await vi.advanceTimersByTimeAsync(0);
    trigger(host).click();
    expect(rows()[0].textContent?.trim()).toBe('Ready!');

    await vi.advanceTimersByTimeAsync(3000);

    expect(rows()[0].textContent?.trim()).toBe('Generate reply');
    expect(rows()[0].disabled).toBe(false);
  });

  it('reports an action that throws instead of failing silently', async () => {
    const host = mount(
      groups(
        item({
          run: () => {
            throw new Error('boom');
          },
        }),
      ),
    );
    trigger(host).click();
    rows()[0].click();

    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());
    trigger(host).click();
    expect(rows()[0].textContent?.trim()).toBe('Something went wrong');
  });

  it('closes on Escape and returns focus to the button', () => {
    const host = mount(groups(item()));
    trigger(host).click();

    rows()[0].dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        composed: true,
        key: 'Escape',
      }),
    );

    expect(menuHost()).toBeUndefined();
    expect(host.shadowRoot?.activeElement).toBe(trigger(host));
  });

  it('closes on Escape pressed on the button after a mouse open', () => {
    const host = mount(groups(item()));
    trigger(host).click();

    trigger(host).dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        composed: true,
        key: 'Escape',
      }),
    );

    expect(menuHost()).toBeUndefined();
  });

  it('closes when the page is pressed outside it, not inside it', () => {
    const host = mount(groups(item()));
    trigger(host).click();

    menuHost()?.dispatchEvent(
      new Event('pointerdown', { bubbles: true, composed: true }),
    );
    expect(menuHost()).toBeDefined();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menuHost()).toBeUndefined();
  });

  it('opens from the keyboard with the first row focused and moves with arrows', () => {
    const host = mount(groups(item()));

    trigger(host).dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }),
    );
    const root = menuHost()?.shadowRoot;
    expect(root?.activeElement).toBe(rows()[0]);

    rows()[0].dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        composed: true,
        key: 'ArrowDown',
      }),
    );
    expect(root?.activeElement).toBe(rows()[1]);
  });
});

describe('content-script theme', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('scopes the persisted preference to Genfeed hosts only', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      'genfeed-settings': { theme: 'dark' },
    });
    const host = mount(groups(item()));

    const stopWatching = watchContentTheme();

    await vi.waitFor(() => {
      expect(host.dataset.genfeedTheme).toBe('dark');
    });
    expect(document.documentElement).not.toHaveAttribute('data-theme');
    stopWatching();
  });

  it('keeps System live and responds to extension storage changes', async () => {
    let mediaListener: (() => void) | undefined;
    let storageListener:
      | ((
          changes: Record<string, chrome.storage.StorageChange>,
          areaName: string,
        ) => void)
      | undefined;
    const mediaQuery = {
      addEventListener: vi.fn((_event: string, listener: () => void) => {
        mediaListener = listener;
      }),
      matches: false,
      removeEventListener: vi.fn(),
    };
    vi.mocked(window.matchMedia).mockReturnValue(
      mediaQuery as unknown as MediaQueryList,
    );
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      'genfeed-settings': { theme: 'system' },
    });
    vi.mocked(chrome.storage.onChanged.addListener).mockImplementation(
      (listener) => {
        storageListener = listener as typeof storageListener;
      },
    );
    const host = mount(groups(item()));

    const stopWatching = watchContentTheme();

    await vi.waitFor(() => {
      expect(host.dataset.genfeedTheme).toBe('light');
    });
    mediaQuery.matches = true;
    mediaListener?.();
    expect(host.dataset.genfeedTheme).toBe('dark');

    storageListener?.(
      { 'genfeed-settings': { newValue: { theme: 'light' } } },
      'local',
    );
    expect(host.dataset.genfeedTheme).toBe('light');
    stopWatching();
  });

  it('returns to System when extension settings are removed', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    let storageListener:
      | ((
          changes: Record<string, chrome.storage.StorageChange>,
          areaName: string,
        ) => void)
      | undefined;
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      'genfeed-settings': { theme: 'dark' },
    });
    vi.mocked(chrome.storage.onChanged.addListener).mockImplementation(
      (listener) => {
        storageListener = listener as typeof storageListener;
      },
    );
    const host = mount(groups(item()));

    const stopWatching = watchContentTheme();
    await vi.waitFor(() => {
      expect(host.dataset.genfeedTheme).toBe('dark');
    });

    storageListener?.(
      { 'genfeed-settings': { oldValue: { theme: 'dark' } } },
      'local',
    );
    expect(host.dataset.genfeedTheme).toBe('light');
    stopWatching();
  });

  it('does not let a stale initial read overwrite a newer storage event', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    let resolveRead: ((settings: Record<string, unknown>) => void) | undefined;
    let storageListener:
      | ((
          changes: Record<string, chrome.storage.StorageChange>,
          areaName: string,
        ) => void)
      | undefined;
    vi.mocked(chrome.storage.local.get).mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );
    vi.mocked(chrome.storage.onChanged.addListener).mockImplementation(
      (listener) => {
        storageListener = listener as typeof storageListener;
      },
    );
    const host = mount(groups(item()));

    const stopWatching = watchContentTheme();
    storageListener?.(
      { 'genfeed-settings': { newValue: { theme: 'light' } } },
      'local',
    );
    expect(host.dataset.genfeedTheme).toBe('light');

    resolveRead?.({ 'genfeed-settings': { theme: 'dark' } });
    await Promise.resolve();
    expect(host.dataset.genfeedTheme).toBe('light');
    stopWatching();
  });
});

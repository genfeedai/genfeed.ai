import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  showTextActionFailure,
  showTextActionPreview,
} from '~platforms/text-action-preview';

const result = {
  hasBrandVoice: true,
  isReplayed: false,
  maxCharacters: 280,
  mode: 'rewrite',
  platform: 'twitter',
  text: 'The launch is live <img src=x onerror=alert(1)>',
} as const;

function card(): ShadowRoot {
  const host = document.getElementById('genfeed-text-action-preview');
  if (!host?.shadowRoot) throw new Error('No preview on the page');
  return host.shadowRoot;
}

function press(root: ShadowRoot, label: string): void {
  const button = Array.from(root.querySelectorAll('button')).find(
    (item) => item.textContent === label,
  );
  if (!button) throw new Error(`No ${label} button`);
  button.click();
}

function labels(root: ShadowRoot): string[] {
  return Array.from(root.querySelectorAll('button')).map(
    (item) => item.textContent ?? '',
  );
}

function show(
  overrides: Partial<Parameters<typeof showTextActionPreview>[0]> = {},
) {
  const onApply = vi.fn().mockReturnValue({ success: true });
  const onUndo = vi.fn().mockReturnValue({ success: true });
  const preview = showTextActionPreview({
    mode: 'rewrite',
    onApply,
    onUndo,
    original: 'Teh launch is live',
    result,
    ...overrides,
  });
  return { onApply, onUndo, preview };
}

describe('text action preview', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the suggestion as text, never as markup, and touches nothing yet', () => {
    const { onApply, onUndo } = show();
    const root = card();

    expect(root.querySelector('.text')?.textContent).toBe(result.text);
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('Teh launch is live');
    expect(labels(root)).toEqual(['Dismiss', 'Apply']);
    expect(onApply).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('titles each mode and shows the voice hint when there is one', () => {
    show({
      mode: 'proofread',
      result: { ...result, hasBrandVoice: false, voiceHint: 'Define a voice.' },
    });
    const root = card();

    expect(root.querySelector('h2')?.textContent).toBe('Proofread');
    expect(root.querySelector('.hint')?.textContent).toBe('Define a voice.');
  });

  it('applies once, then offers Undo and Done', () => {
    const { onApply, onUndo } = show();
    const root = card();

    press(root, 'Apply');
    expect(onApply).toHaveBeenCalledOnce();
    expect(labels(root)).toEqual(['Undo', 'Done']);

    press(root, 'Undo');
    expect(onUndo).toHaveBeenCalledOnce();
    expect(labels(root)).toEqual(['Dismiss', 'Apply']);
  });

  it('keeps the card and says why when the draft changed', () => {
    const { onApply } = show();
    onApply.mockReturnValue({ error: 'Your draft changed.', success: false });
    const root = card();

    press(root, 'Apply');

    expect(labels(root)).toEqual(['Dismiss', 'Apply']);
    const status = root.querySelector('[role="status"]') as HTMLElement;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe('Your draft changed.');
  });

  it('keeps Undo when it cannot undo', () => {
    const { onUndo } = show();
    onUndo.mockReturnValue({
      error: 'Draft changed after Apply.',
      success: false,
    });
    const root = card();

    press(root, 'Apply');
    press(root, 'Undo');

    expect(labels(root)).toEqual(['Undo', 'Done']);
    expect(root.querySelector('[role="status"]')?.textContent).toBe(
      'Draft changed after Apply.',
    );
  });

  it('closes on Dismiss, Done and Escape without changing the composer', () => {
    const { onApply, onUndo } = show();
    press(card(), 'Dismiss');
    expect(document.getElementById('genfeed-text-action-preview')).toBeNull();

    const second = show();
    press(card(), 'Apply');
    press(card(), 'Done');
    expect(document.getElementById('genfeed-text-action-preview')).toBeNull();
    expect(second.onUndo).not.toHaveBeenCalled();

    show();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('genfeed-text-action-preview')).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('shows one preview at a time', () => {
    show();
    show();
    expect(
      document.querySelectorAll('#genfeed-text-action-preview'),
    ).toHaveLength(1);
  });
});

describe('text action preview routing notice and failure card', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the routing notice as text, never markup', () => {
    show({
      routing: {
        hasBrandVoice: false,
        notice: 'Written locally <b>with</b> Claude Code.',
        providerId: 'claude-cli',
        providerLabel: 'Claude Code',
        reason: 'credit_limit',
        voiceSource: 'none',
      },
    });

    const notice = card().querySelector('.hint');
    expect(notice?.textContent).toBe(
      'Written locally <b>with</b> Claude Code.',
    );
    expect(card().querySelector('b')).toBeNull();
  });

  it('shows why the action failed with only the actions that apply', () => {
    const onRetry = vi.fn();
    const onOpenProviderSettings = vi.fn();
    showTextActionFailure({
      message: 'The Genfeed local bridge is not reachable.',
      mode: 'rewrite',
      onOpenProviderSettings,
      onRetry,
      recovery: {
        canOpenProviderSettings: true,
        canRetry: true,
        kind: 'host_unreachable',
        retryTarget: 'local',
      },
    });

    expect(card().querySelector('[role="alert"]')?.textContent).toBe(
      'The Genfeed local bridge is not reachable.',
    );
    expect(labels(card())).toEqual([
      'Dismiss',
      'Provider settings',
      'Retry with local provider',
    ]);
    press(card(), 'Retry with local provider');
    press(card(), 'Provider settings');
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onOpenProviderSettings).toHaveBeenCalledOnce();
    press(card(), 'Dismiss');
    expect(document.getElementById('genfeed-text-action-preview')).toBeNull();
  });

  it('offers a plain Retry for an unconfirmed Genfeed outcome', () => {
    showTextActionFailure({
      message: 'Genfeed did not confirm whether this finished.',
      mode: 'proofread',
      onOpenProviderSettings: vi.fn(),
      onRetry: vi.fn(),
      recovery: {
        canOpenProviderSettings: false,
        canRetry: true,
        kind: 'cloud_unconfirmed',
        retryTarget: 'cloud',
      },
    });

    expect(labels(card())).toEqual(['Dismiss', 'Retry']);
  });

  it('closes on Escape', () => {
    showTextActionFailure({
      message: 'Failed',
      mode: 'rewrite',
      onOpenProviderSettings: vi.fn(),
      onRetry: vi.fn(),
      recovery: {
        canOpenProviderSettings: true,
        canRetry: false,
        kind: 'host_failed',
        retryTarget: null,
      },
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(document.getElementById('genfeed-text-action-preview')).toBeNull();
  });
});

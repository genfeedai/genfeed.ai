import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  normalizeElementKey,
  useElementRowSidebar,
} from '@ui/display/element-scope-badge/element-row-sidebar';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return {
    useTranslations: (namespace: string) =>
      namespace === 'ui.elementPlatformFields'
        ? (key: string) => key
        : translateFromCatalog(namespace),
  };
});

const element = {
  description: 'Slow push in',
  id: 'el-1',
  isActive: true,
  isPlatformDefault: true,
  key: 'dolly_in',
  label: 'Dolly in',
};

describe('useElementRowSidebar', () => {
  it('identifies the element by label and key', () => {
    const { result } = renderHook(() => useElementRowSidebar());
    const sidebar = result.current;

    expect(sidebar.getId(element)).toBe('el-1');
    expect(sidebar.getTitle(element)).toBe('Dolly in');
    expect(sidebar.getSubtitle?.(element)).toBe('dolly_in');
  });

  it('shows scope and read-only facts when no saver is given', () => {
    const readOnly = renderHook(() => useElementRowSidebar()).result.current;
    render(readOnly.render(element));

    expect(screen.getByText('scopePlatform')).toBeInTheDocument();
    expect(screen.getByText('Slow push in')).toBeInTheDocument();
    expect(screen.getByText('Key')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('edits the key in place, normalizing it before saving', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const editable = renderHook(() => useElementRowSidebar({ onSave })).result
      .current;
    render(editable.render(element));

    expect(
      screen.queryByRole('button', { name: 'Edit' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Key' }));
    const input = screen.getByRole('textbox', { name: 'Key' });
    fireEvent.change(input, { target: { value: 'Dolly Out!' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(element, { key: 'dolly-out' });
    });
  });

  it('saves a toggled active state', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const editable = renderHook(() => useElementRowSidebar({ onSave })).result
      .current;
    render(editable.render(element));

    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(element, { isActive: false });
    });
  });
});

describe('normalizeElementKey', () => {
  it.each([
    ['Dolly Out!', 'dolly-out'],
    ['Wide  Angle', 'wide-angle'],
    ['already-ok', 'already-ok'],
  ])('turns %j into %j', (input, expected) => {
    expect(normalizeElementKey(input)).toBe(expected);
  });
});

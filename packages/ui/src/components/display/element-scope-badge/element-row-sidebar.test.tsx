import { render, renderHook, screen } from '@testing-library/react';
import { useElementRowSidebar } from '@ui/display/element-scope-badge/element-row-sidebar';
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

  it('shows scope and facts, with Edit only when editable', () => {
    const readOnly = renderHook(() => useElementRowSidebar()).result.current;
    const { unmount } = render(readOnly.render(element));

    expect(screen.getByText('scopePlatform')).toBeInTheDocument();
    expect(screen.getByText('Slow push in')).toBeInTheDocument();
    expect(screen.getByText('Key')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    unmount();

    const editable = renderHook(() => useElementRowSidebar({ onEdit: vi.fn() }))
      .result.current;
    render(editable.render(element));

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});

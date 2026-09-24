import { fireEvent, render, screen, within } from '@testing-library/react';
import GenerationHarnessSettingsCard from '@ui/dropdowns/generation-setup/GenerationHarnessSettingsCard';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/app/messages/en/ui.json';

function EnglishMessages({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={{ ui: messages }}>
      {children}
    </NextIntlClientProvider>
  );
}

const settings = {
  organizationEnabled: true,
  brandEnabled: null,
  brandId: 'brand-1',
  isEnabled: true,
  source: 'organization' as const,
};
function props() {
  return {
    brandId: 'brand-1',
    error: null,
    isLoading: false,
    isSaving: false,
    onRefresh: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    settings,
  };
}

describe('GenerationHarnessSettingsCard', () => {
  it('offers a distinct brand override and inheritance without changing the organization', () => {
    const input = props();
    render(<GenerationHarnessSettingsCard {...input} />, {
      wrapper: EnglishMessages,
    });
    const group = within(
      screen.getByRole('group', { name: 'Brand prompt enhancement' }),
    );
    expect(group.getByRole('button', { name: 'Inherit' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(group.getByRole('button', { name: 'Off' }));
    expect(input.onSave).toHaveBeenCalledWith('brand', false);
    fireEvent.click(group.getByRole('button', { name: 'Inherit' }));
    expect(input.onSave).toHaveBeenCalledWith('brand', null);
  });
  it('exposes organization default and reset with accessible names', () => {
    const input = props();
    render(<GenerationHarnessSettingsCard {...input} />, {
      wrapper: EnglishMessages,
    });
    fireEvent.click(
      screen.getByRole('switch', { name: 'Organization prompt enhancement' }),
    );
    expect(input.onSave).toHaveBeenCalledWith('organization', false);
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset organization default' }),
    );
    expect(input.onSave).toHaveBeenCalledWith('organization', null);
  });
  it('disables writes while saving and makes an error recoverable', () => {
    const input = props();
    const { rerender } = render(
      <GenerationHarnessSettingsCard {...input} isSaving />,
      { wrapper: EnglishMessages },
    );
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    rerender(<GenerationHarnessSettingsCard {...input} error="Save failed" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh settings' }));
    expect(input.onRefresh).toHaveBeenCalledOnce();
  });
});

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
  it('offers a distinct brand override and default without changing the organization', () => {
    const input = props();
    render(<GenerationHarnessSettingsCard {...input} />, {
      wrapper: EnglishMessages,
    });
    const group = within(
      screen.getByRole('group', { name: 'Brand prompt enhancement' }),
    );
    expect(group.getByRole('button', { name: 'Default' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(group.getByRole('button', { name: 'Off' }));
    expect(input.onSave).toHaveBeenCalledWith('brand', false);
    fireEvent.click(group.getByRole('button', { name: 'Default' }));
    expect(input.onSave).toHaveBeenCalledWith('brand', null);
  });
  it('gives the organization a plain On / Off control with no Default segment', () => {
    const input = props();
    render(<GenerationHarnessSettingsCard {...input} />, {
      wrapper: EnglishMessages,
    });
    const group = within(
      screen.getByRole('group', { name: 'Organization prompt enhancement' }),
    );
    expect(group.getByRole('button', { name: 'On' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(group.getByRole('button', { name: 'Off' }));
    expect(input.onSave).toHaveBeenCalledWith('organization', false);
    expect(
      group.queryByRole('button', { name: 'Default' }),
    ).not.toBeInTheDocument();
  });
  it('shows an unset organization as On, the system default', () => {
    render(
      <GenerationHarnessSettingsCard
        {...props()}
        settings={{ ...settings, organizationEnabled: null }}
      />,
      { wrapper: EnglishMessages },
    );
    const group = within(
      screen.getByRole('group', { name: 'Organization prompt enhancement' }),
    );
    expect(group.getByRole('button', { name: 'On' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  it('says what the brand row does with the organization setting', () => {
    const { rerender } = render(
      <GenerationHarnessSettingsCard {...props()} />,
      { wrapper: EnglishMessages },
    );
    expect(
      screen.getByText('Follows the organization, which is on.'),
    ).toBeInTheDocument();
    rerender(
      <GenerationHarnessSettingsCard
        {...props()}
        settings={{ ...settings, organizationEnabled: false, isEnabled: false }}
      />,
    );
    expect(
      screen.getByText('Follows the organization, which is off.'),
    ).toBeInTheDocument();
    rerender(
      <GenerationHarnessSettingsCard
        {...props()}
        settings={{ ...settings, brandEnabled: false, isEnabled: false }}
      />,
    );
    expect(
      screen.getByText('Overrides the organization setting for this brand.'),
    ).toBeInTheDocument();
  });
  it('describes the resolved value for assistive technology while inheriting', () => {
    render(<GenerationHarnessSettingsCard {...props()} />, {
      wrapper: EnglishMessages,
    });
    expect(
      screen.getByRole('group', { name: 'Brand prompt enhancement' }),
    ).toHaveAccessibleDescription('Currently on');
    expect(
      screen.getByRole('group', { name: 'Organization prompt enhancement' }),
    ).not.toHaveAccessibleDescription();
  });
  it('renders both rows with the same control column', () => {
    render(<GenerationHarnessSettingsCard {...props()} />, {
      wrapper: EnglishMessages,
    });
    const columns = [
      screen.getByRole('group', { name: 'Organization prompt enhancement' }),
      screen.getByRole('group', { name: 'Brand prompt enhancement' }),
    ].map((group) => group.parentElement?.className);
    expect(columns[0]).toBe(columns[1]);
    expect(columns[0]).toContain('w-44');
  });
  it('adds nothing to the layout while saving and makes an error recoverable', () => {
    const input = props();
    const { container, rerender } = render(
      <GenerationHarnessSettingsCard {...input} />,
      { wrapper: EnglishMessages },
    );
    const idleCount = container.querySelectorAll('p, button').length;
    rerender(<GenerationHarnessSettingsCard {...input} isSaving />);
    expect(container.querySelectorAll('p, button')).toHaveLength(idleCount);
    expect(screen.queryByText(/Saving/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Off' })[0]).toBeEnabled();
    rerender(<GenerationHarnessSettingsCard {...input} error="Save failed" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh settings' }));
    expect(input.onRefresh).toHaveBeenCalledOnce();
  });
});

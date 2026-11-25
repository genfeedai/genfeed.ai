import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandProfileVisibility from './BrandProfileVisibility';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

function renderControl(isPublic: boolean) {
  const onCopy = vi.fn();
  const onToggle = vi.fn();
  render(
    <BrandProfileVisibility
      isPublic={isPublic}
      onCopy={onCopy}
      onToggle={onToggle}
      profileUrl="https://genfeed.test/@studio"
    />,
  );
  return { onCopy, onToggle };
}

describe('BrandProfileVisibility', () => {
  it('copies the link and opens the profile once it is public', () => {
    const { onCopy } = renderControl(true);

    expect(
      screen.getByRole('switch', { name: 'Public Profile' }),
    ).toBeChecked();
    fireEvent.click(
      screen.getByRole('button', { name: 'Copy public profile link' }),
    );
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('link', { name: 'View public profile' }),
    ).toHaveAttribute('href', 'https://genfeed.test/@studio');
  });

  it('turns copy and open off while the profile is private', () => {
    renderControl(false);

    expect(
      screen.getByRole('switch', { name: 'Public Profile' }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Copy public profile link' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'View public profile' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('link', { name: 'View public profile' }),
    ).toBeNull();
  });

  it('reports the new visibility when the switch is flipped', () => {
    const { onToggle } = renderControl(false);

    fireEvent.click(screen.getByRole('switch', { name: 'Public Profile' }));

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('shows no link text and no helper sentence', () => {
    renderControl(true);

    expect(screen.queryByText(/genfeed\.test/)).toBeNull();
    expect(screen.queryByText(/Turn on Public/)).toBeNull();
  });
});

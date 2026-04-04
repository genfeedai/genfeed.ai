import type { ICredential } from '@genfeedai/interfaces';
import { CredentialPlatform } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import PlatformSelector from '@ui/forms/selectors/platform-selector/PlatformSelector';
import { describe, expect, it, vi } from 'vitest';

const mockCredentials: ICredential[] = [
  {
    externalHandle: '@mychannel',
    id: 'cred-1',
    label: 'My YouTube Channel',
    platform: CredentialPlatform.YOUTUBE,
  } as ICredential,
  {
    externalHandle: '@mytwitter',
    id: 'cred-2',
    platform: CredentialPlatform.TWITTER,
  } as ICredential,
  {
    id: 'cred-3',
    label: 'My Instagram',
    platform: CredentialPlatform.INSTAGRAM,
  } as ICredential,
];

describe('PlatformSelector', () => {
  it('renders all credentials with labels/handles', () => {
    const onSelect = vi.fn();
    render(
      <PlatformSelector
        credentials={mockCredentials}
        selectedCredentialId="cred-1"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText('My YouTube Channel')).toBeInTheDocument();
    expect(screen.getByText('@mytwitter')).toBeInTheDocument();
    expect(screen.getByText('My Instagram')).toBeInTheDocument();
  });

  it('shows selected state for active credential', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <PlatformSelector
        credentials={mockCredentials}
        selectedCredentialId="cred-1"
        onSelect={onSelect}
      />,
    );

    const buttons = container.querySelectorAll('button');
    // Selected state applies bg-foreground/10 class
    expect(buttons[0]).toHaveClass('bg-foreground/10');
  });

  it('calls onSelect when credential is clicked', () => {
    const onSelect = vi.fn();
    render(
      <PlatformSelector
        credentials={mockCredentials}
        selectedCredentialId="cred-1"
        onSelect={onSelect}
      />,
    );

    const twitterButton = screen.getByText('@mytwitter').closest('button');
    fireEvent.click(twitterButton!);

    expect(onSelect).toHaveBeenCalledWith('cred-2');
  });

  it('shows empty state when no credentials', () => {
    const onSelect = vi.fn();
    render(
      <PlatformSelector
        credentials={[]}
        selectedCredentialId=""
        onSelect={onSelect}
      />,
    );

    expect(
      screen.getByText('No platform accounts available'),
    ).toBeInTheDocument();
  });

  it('disables all buttons when isDisabled is true', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <PlatformSelector
        credentials={mockCredentials}
        selectedCredentialId="cred-1"
        onSelect={onSelect}
        isDisabled={true}
      />,
    );

    const buttons = container.querySelectorAll('button');
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
    });
  });

  it('displays credential label or handle', () => {
    const onSelect = vi.fn();
    render(
      <PlatformSelector
        credentials={mockCredentials}
        selectedCredentialId="cred-1"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText('My YouTube Channel')).toBeInTheDocument();
    expect(screen.getByText('@mytwitter')).toBeInTheDocument();
    expect(screen.getByText('My Instagram')).toBeInTheDocument();
  });
});

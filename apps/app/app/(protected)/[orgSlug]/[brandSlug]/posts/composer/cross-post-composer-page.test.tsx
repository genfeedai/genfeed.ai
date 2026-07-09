import '@testing-library/jest-dom/vitest';
import { CredentialPlatform } from '@genfeedai/enums';
import type { ICredential } from '@genfeedai/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CrossPostComposerPage from './cross-post-composer-page';

const useBrandMock = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => useBrandMock(),
}));

function credential(
  overrides: Partial<ICredential> & {
    id: string;
    platform: CredentialPlatform;
  },
): ICredential {
  return {
    accessTokenExpiry: undefined,
    accountHealth: undefined,
    brand: 'brand-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    description: undefined,
    externalHandle: overrides.externalHandle ?? overrides.id,
    externalId: overrides.externalId ?? overrides.id,
    externalUrl: undefined,
    id: overrides.id,
    isConnected: overrides.isConnected ?? true,
    label: overrides.label,
    organization: {} as ICredential['organization'],
    platform: overrides.platform,
    tags: [],
    token: '',
    tokenExpiry: undefined,
    updatedAt: '2026-01-01T00:00:00.000Z',
    user: {} as ICredential['user'],
    ...overrides,
  };
}

describe('CrossPostComposerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBrandMock.mockReturnValue({ credentials: [] });
  });

  it('renders an empty channel state without connected credentials', () => {
    render(<CrossPostComposerPage />);

    expect(
      screen.getByText('No connected publishing channels available.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Select at least one channel target to review scheduling readiness.',
      ),
    ).toBeInTheDocument();
  });

  it('preserves per-target caption overrides while switching targets', () => {
    useBrandMock.mockReturnValue({
      credentials: [
        credential({
          externalHandle: 'launch_x',
          id: 'cred-x',
          platform: CredentialPlatform.TWITTER,
        }),
        credential({
          externalHandle: 'company',
          id: 'cred-linkedin',
          platform: CredentialPlatform.LINKEDIN,
        }),
      ],
    });

    render(<CrossPostComposerPage />);

    fireEvent.change(screen.getByLabelText('Release title'), {
      target: { value: 'Launch release' },
    });
    fireEvent.change(screen.getByLabelText('Base content'), {
      target: { value: 'Base launch copy' },
    });
    fireEvent.change(screen.getByLabelText('Schedule date'), {
      target: { value: '2026-07-15T09:30' },
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /x .*launch_x/i }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: /linkedin .*company/i }),
    );

    fireEvent.click(screen.getByRole('button', { name: /edit x .*launch_x/i }));
    fireEvent.change(screen.getByLabelText('Target caption'), {
      target: { value: 'X variant copy' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: /edit linkedin .*company/i }),
    );
    fireEvent.change(screen.getByLabelText('Target caption'), {
      target: { value: 'LinkedIn variant copy' },
    });

    fireEvent.click(screen.getByRole('button', { name: /edit x .*launch_x/i }));

    expect(screen.getByLabelText('Target caption')).toHaveValue(
      'X variant copy',
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('shows exact target blocking reasons before submit', () => {
    useBrandMock.mockReturnValue({
      credentials: [
        credential({
          externalHandle: 'studio',
          id: 'cred-youtube',
          platform: CredentialPlatform.YOUTUBE,
        }),
      ],
    });

    render(<CrossPostComposerPage />);

    fireEvent.click(
      screen.getByRole('checkbox', { name: /youtube .*studio/i }),
    );

    expect(
      screen.getByText('Release content is required for YouTube.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Schedule date is required for YouTube.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('YouTube requires at least 1 media item(s).'),
    ).toBeInTheDocument();
  });
});

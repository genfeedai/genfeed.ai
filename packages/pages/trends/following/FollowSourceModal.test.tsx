import '@testing-library/jest-dom/vitest';
import { SocialSourcePlatform } from '@genfeedai/enums';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FollowSourceModal, {
  candidateKey,
  normalizeSearchQuery,
} from './FollowSourceModal';

const validateSourceMock = vi.fn();
const postMock = vi.fn();
const syncSourceMock = vi.fn();

const socialSourcesServiceMock = {
  post: postMock,
  syncSource: syncSourceMock,
  validateSource: validateSourceMock,
};

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} alt={props.alt || ''} />
  ),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => socialSourcesServiceMock,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

vi.mock('@services/social/social-sources.service', () => ({
  SocialSourcesService: {
    getInstance: () => socialSourcesServiceMock,
  },
}));

describe('normalizeSearchQuery', () => {
  it('extracts handles from x.com profile URLs', () => {
    expect(normalizeSearchQuery('https://x.com/VincentShipsIt')).toBe(
      'vincentshipsit',
    );
    expect(normalizeSearchQuery('https://x.com/@VincentShipsIt')).toBe(
      'vincentshipsit',
    );
  });

  it('normalizes bare handles', () => {
    expect(normalizeSearchQuery('@VincentShipsIt')).toBe('vincentshipsit');
    expect(normalizeSearchQuery('  VincentShipsIt  ')).toBe('vincentshipsit');
  });
});

describe('candidateKey', () => {
  it('builds a stable platform:handle key', () => {
    expect(candidateKey(SocialSourcePlatform.TWITTER, 'VincentShipsIt')).toBe(
      'twitter:vincentshipsit',
    );
  });
});

describe('FollowSourceModal', () => {
  beforeEach(() => {
    validateSourceMock.mockReset();
    postMock.mockReset();
    syncSourceMock.mockReset();

    validateSourceMock.mockImplementation(async (platform: string) => {
      if (platform === SocialSourcePlatform.TWITTER) {
        return {
          displayName: 'Vincent e/acc',
          followersCount: 72,
          handle: 'vincentshipsit',
          platform: SocialSourcePlatform.TWITTER,
          profileUrl: 'https://x.com/vincentshipsit',
          valid: true,
        };
      }

      return {
        error: `All source collectors failed for ${platform}/@vincentshipsit`,
        valid: false,
      };
    });
  });

  async function searchForHandle(handle = 'https://x.com/VincentShipsIt') {
    render(
      <FollowSourceModal
        brandId="brand-1"
        existingSources={[]}
        open
        onFollowed={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );

    const searchInput = screen.getByLabelText('Search');
    fireEvent.change(searchInput, { target: { value: handle } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText('1 account available')).toBeInTheDocument();
    });
  }

  it('auto-selects a valid X match so Follow is enabled after search', async () => {
    await searchForHandle();

    const row = screen.getByRole('checkbox', {
      name: 'Select X @vincentshipsit',
    });
    expect(row).toHaveAttribute('aria-checked', 'true');

    const followButton = screen.getByRole('button', {
      name: /Follow selected/i,
    });
    expect(followButton).not.toBeDisabled();
  });

  it('toggles selection when the account row is clicked', async () => {
    const user = userEvent.setup();
    await searchForHandle();

    const row = screen.getByRole('checkbox', {
      name: 'Select X @vincentshipsit',
    });
    expect(row).toHaveAttribute('aria-checked', 'true');

    await user.click(row);
    expect(row).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.getByRole('button', { name: /Follow selected/i }),
    ).toBeDisabled();

    await user.click(row);
    expect(row).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('button', { name: /Follow selected/i }),
    ).not.toBeDisabled();
  });

  it('does not select Not found platforms', async () => {
    await searchForHandle();

    const results = screen.getByRole('list', {
      name: 'Source search results',
    });
    expect(within(results).getAllByText('Not found')).toHaveLength(2);
    expect(
      screen.queryByRole('checkbox', {
        name: /Select Instagram @vincentshipsit/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', {
        name: /Select TikTok @vincentshipsit/i,
      }),
    ).not.toBeInTheDocument();
  });

  it('follows only the selected valid account', async () => {
    const user = userEvent.setup();
    const onFollowed = vi.fn();
    const onOpenChange = vi.fn();

    postMock.mockResolvedValue({ id: 'source-1' });
    syncSourceMock.mockResolvedValue({ count: 3 });

    render(
      <FollowSourceModal
        brandId="brand-1"
        existingSources={[]}
        open
        onFollowed={onFollowed}
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'vincentshipsit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText('1 account available')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Follow selected/i }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledTimes(1);
    });

    expect(postMock).toHaveBeenCalledWith(
      expect.objectContaining({
        handle: 'vincentshipsit',
        platform: SocialSourcePlatform.TWITTER,
      }),
    );
    expect(syncSourceMock).toHaveBeenCalledWith('source-1', {
      brandId: 'brand-1',
      limit: 25,
    });
    expect(onFollowed).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

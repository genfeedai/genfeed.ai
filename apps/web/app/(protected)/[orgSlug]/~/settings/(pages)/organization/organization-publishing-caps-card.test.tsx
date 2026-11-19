import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationPublishingCapsCard from './organization-publishing-caps-card';

const mocks = vi.hoisted(() => ({
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  organizationId: 'org-1',
  updateSettings: vi.fn(),
  settings: {
    quotaInstagram: 5,
    quotaTiktok: 1,
    quotaTwitter: 15,
    quotaYoutube: 5,
  } as Record<string, number>,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    organizationId: mocks.organizationId,
  }),
}));

vi.mock('@/hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: () => ({
    settings: mocks.settings,
    updateSettings: mocks.updateSettings,
  }),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationsError,
      success: mocks.notificationsSuccess,
    }),
  },
}));

describe('OrganizationPublishingCapsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings = {
      quotaInstagram: 5,
      quotaTiktok: 1,
      quotaTwitter: 15,
      quotaYoutube: 5,
    };
    mocks.updateSettings
      .mockReset()
      .mockImplementation(async (key: string, value: number) => {
        mocks.settings = { ...mocks.settings, [key]: value };
      });
  });

  it('renders a cap field per platform seeded from organization settings', () => {
    render(<OrganizationPublishingCapsCard />);

    expect(screen.getByText('Daily publishing caps')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Max published posts per connected account per UTC day. A thread counts as one post. 0 = no cap.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('X')).toHaveValue(15);
    expect(screen.getByLabelText('Instagram')).toHaveValue(5);
    expect(screen.getByLabelText('YouTube')).toHaveValue(5);
    expect(screen.getByLabelText('TikTok')).toHaveValue(1);
  });

  it('puts the help text directly below the heading', () => {
    render(<OrganizationPublishingCapsCard />);

    expect(
      screen.getByRole('heading', { name: 'Daily publishing caps' })
        .parentElement?.nextElementSibling,
    ).toHaveTextContent(
      'Max published posts per connected account per UTC day.',
    );
  });

  it('saves only the edited field on blur and ignores an unchanged field', async () => {
    render(<OrganizationPublishingCapsCard />);

    fireEvent.blur(screen.getByLabelText('Instagram'));
    const tiktok = screen.getByLabelText('TikTok');
    fireEvent.change(tiktok, { target: { value: '0' } });
    expect(mocks.updateSettings).not.toHaveBeenCalled();
    fireEvent.blur(tiktok);

    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenCalledExactlyOnceWith(
        'quotaTiktok',
        0,
      );
      expect(mocks.notificationsSuccess).toHaveBeenCalled();
    });
  });

  it('saves on Enter via blur', async () => {
    render(<OrganizationPublishingCapsCard />);

    const twitter = screen.getByLabelText('X');
    twitter.focus();
    fireEvent.change(twitter, { target: { value: '48' } });
    fireEvent.keyDown(twitter, { key: 'Enter' });

    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledExactlyOnceWith(
        'quotaTwitter',
        48,
      ),
    );
  });

  it.each(['', '1001'])('keeps invalid edits local (%j)', (value) => {
    render(<OrganizationPublishingCapsCard />);

    const field = screen.getByLabelText('X');
    fireEvent.change(field, { target: { value } });
    fireEvent.blur(field);

    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Each cap must be a whole number between 0 and 1000.',
    );
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('keeps other inputs editable and serializes concurrent edits', async () => {
    let finishSave: (() => void) | undefined;
    mocks.updateSettings.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    render(<OrganizationPublishingCapsCard />);

    const twitter = screen.getByLabelText('X');
    fireEvent.change(twitter, { target: { value: '48' } });
    fireEvent.blur(twitter);
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(1));

    const tiktok = screen.getByLabelText('TikTok');
    expect(tiktok).toBeEnabled();
    fireEvent.change(tiktok, { target: { value: '8' } });
    fireEvent.blur(tiktok);
    expect(mocks.updateSettings).toHaveBeenCalledTimes(1);

    await act(async () => finishSave?.());
    await waitFor(() => {
      expect(mocks.updateSettings.mock.calls).toEqual([
        ['quotaTwitter', 48],
        ['quotaTiktok', 8],
      ]);
    });
  });

  it('saves a revert when the prior edit is still in flight', async () => {
    let finishSave: (() => void) | undefined;
    mocks.updateSettings.mockImplementationOnce(
      (key: string, value: number) =>
        new Promise<void>((resolve) => {
          finishSave = () => {
            mocks.settings = { ...mocks.settings, [key]: value };
            resolve();
          };
        }),
    );
    render(<OrganizationPublishingCapsCard />);

    const tiktok = screen.getByLabelText('TikTok');
    fireEvent.change(tiktok, { target: { value: '8' } });
    fireEvent.blur(tiktok);
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(1));

    fireEvent.change(tiktok, { target: { value: '1' } });
    fireEvent.blur(tiktok);
    await act(async () => finishSave?.());

    expect(mocks.updateSettings.mock.calls).toEqual([
      ['quotaTiktok', 8],
      ['quotaTiktok', 1],
    ]);
    expect(tiktok).toHaveValue(1);
  });

  it('retains a failed edit for another blur', async () => {
    mocks.updateSettings.mockRejectedValueOnce(new Error('boom'));
    render(<OrganizationPublishingCapsCard />);

    const tiktok = screen.getByLabelText('TikTok');
    fireEvent.change(tiktok, { target: { value: '8' } });
    fireEvent.blur(tiktok);

    await waitFor(() =>
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to save publishing caps',
      ),
    );
    expect(tiktok).toHaveValue(8);
    fireEvent.blur(tiktok);
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(2));
  });
});

import { CredentialPlatform } from '@genfeedai/contracts';
import type { IFacebookLiveVideo } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FacebookLiveDialog from '@/features/brands/components/integrations/FacebookLiveDialog';

const startLive = vi.fn();
const endLive = vi.fn();

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: async () => 'token' }),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: async () => 'token',
}));

vi.mock('@services/external/services.service', () => ({
  ServicesService: class {
    postEndFacebookLive = endLive;
    postStartFacebookLive = startLive;
  },
}));

const connection = {
  credentialId: 'cred-1',
  name: 'Launch Page',
  platform: CredentialPlatform.FACEBOOK,
};

const started: IFacebookLiveVideo = {
  liveVideoId: 'live-1',
  permalinkUrl: 'https://www.facebook.com/page-1/videos/live-1',
  postId: 'post-1',
  state: 'live',
  streamKey: 'KEY-1',
  streamUrl: 'rtmps://live-api-s.facebook.com:443/rtmp',
};

function renderDialog() {
  return render(
    <FacebookLiveDialog connection={connection} onOpenChange={vi.fn()} open />,
  );
}

describe('FacebookLiveDialog', () => {
  beforeEach(() => {
    startLive.mockReset();
    endLive.mockReset();
  });

  it('starts a live video and shows the address and key for the encoder', async () => {
    startLive.mockResolvedValue(started);
    renderDialog();

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: 'Launch day' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start live video' }));

    expect(
      await screen.findByDisplayValue(started.streamUrl ?? ''),
    ).toBeVisible();
    expect(screen.getByDisplayValue('KEY-1')).toBeInTheDocument();
    expect(startLive).toHaveBeenCalledWith('cred-1', { title: 'Launch day' });
  });

  it('ends the live video and drops the key from the screen', async () => {
    startLive.mockResolvedValue(started);
    endLive.mockResolvedValue({
      endedAt: '2026-11-23T14:00:00.000Z',
      liveVideoId: 'live-1',
      permalinkUrl: started.permalinkUrl,
      postId: 'post-1',
      state: 'ended',
    });
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: 'Launch day' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start live video' }));
    await screen.findByDisplayValue('KEY-1');

    fireEvent.click(screen.getByRole('button', { name: 'End live video' }));

    await waitFor(() =>
      expect(screen.queryByDisplayValue('KEY-1')).not.toBeInTheDocument(),
    );
    expect(endLive).toHaveBeenCalledWith('cred-1', 'post-1');
    expect(
      screen.getByRole('link', { name: 'View the video on Facebook' }),
    ).toHaveAttribute('href', started.permalinkUrl);
  });

  it('tells the user when the live video could not start', async () => {
    startLive.mockRejectedValue(new Error('refused'));
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: 'Launch day' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start live video' }));

    expect(
      await screen.findByText(/Could not start the live video/),
    ).toBeVisible();
  });
});

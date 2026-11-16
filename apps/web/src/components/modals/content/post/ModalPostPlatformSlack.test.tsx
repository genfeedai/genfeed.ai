import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import ModalPostPlatformSlack from '@/components/modals/content/post/ModalPostPlatformSlack';

const slack = vi.hoisted(() => ({
  channels: [
    { id: 'C01', isPrivate: false, name: 'announcements' },
    { id: 'C02', isPrivate: true, name: 'launch-team' },
  ],
  isFailing: false,
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));

// One getter for every render, as the real hook returns, so the picker's load
// effect runs once per brand and workspace.
const getService = vi.hoisted(() => async () => ({
  getSlackChannels: async () => {
    if (slack.isFailing) {
      throw new Error('slack down');
    }
    return slack.channels;
  },
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@services/core/logger.service', () => ({
  logger: { error: () => undefined },
}));

describe('ModalPostPlatformSlack', () => {
  beforeAll(() => {
    // Radix Select relies on pointer-capture and layout APIs jsdom omits.
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => undefined;
    Element.prototype.releasePointerCapture = () => undefined;
    Element.prototype.scrollIntoView = () => undefined;
  });

  it('lists the workspace channels and reports the one chosen', async () => {
    const chosen: string[] = [];
    render(
      <ModalPostPlatformSlack
        channelId=""
        credentialId="slack-cred"
        isLoading={false}
        onChannelChange={(channelId) => chosen.push(channelId)}
      />,
    );

    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(
      await screen.findByRole('option', { name: '#announcements' }),
    );

    expect(chosen).toEqual(['C01']);
  });

  it('shows the channel already chosen', async () => {
    render(
      <ModalPostPlatformSlack
        channelId="C02"
        credentialId="slack-cred"
        isLoading={false}
        onChannelChange={() => undefined}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveTextContent(
        '#launch-team (private)',
      ),
    );
  });

  it('says so when the channels cannot be loaded', async () => {
    slack.isFailing = true;
    render(
      <ModalPostPlatformSlack
        channelId=""
        credentialId="slack-cred"
        isLoading={false}
        onChannelChange={() => undefined}
      />,
    );

    expect(
      await screen.findByText(
        'Channels could not be loaded. Reconnect Slack and try again.',
      ),
    ).toBeInTheDocument();
    slack.isFailing = false;
  });
});

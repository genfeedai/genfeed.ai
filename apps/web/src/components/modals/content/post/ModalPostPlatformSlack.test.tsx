import '@testing-library/jest-dom/vitest';

import {
  CredentialPlatform,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IPostPlatformConfig } from '@genfeedai/contracts/interfaces';
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

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    getSlackChannels: async () => {
      if (slack.isFailing) {
        throw new Error('slack down');
      }
      return slack.channels;
    },
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: () => undefined },
}));

function buildConfig(
  targetSettings?: IPostPlatformConfig['targetSettings'],
): IPostPlatformConfig {
  return {
    credentialId: 'slack-cred',
    customScheduledDate: '',
    description: '',
    enabled: true,
    handle: 'acme',
    label: '',
    overrideSchedule: false,
    platform: CredentialPlatform.SLACK,
    targetExecutionState: TargetExecutionState.SCHEDULED,
    targetSettings,
    visibility: PostVisibility.PUBLIC,
  };
}

describe('ModalPostPlatformSlack', () => {
  beforeAll(() => {
    // Radix Select relies on pointer-capture and layout APIs jsdom omits.
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => undefined;
    Element.prototype.releasePointerCapture = () => undefined;
    Element.prototype.scrollIntoView = () => undefined;
  });

  it('lists the workspace channels and reports the one chosen', async () => {
    const chosen: Array<Partial<IPostPlatformConfig>> = [];
    render(
      <ModalPostPlatformSlack
        config={buildConfig()}
        isEnabled
        isLoading={false}
        updatePlatformConfig={(_id, updates) => chosen.push(updates)}
      />,
    );

    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(
      await screen.findByRole('option', { name: '#announcements' }),
    );

    expect(chosen).toEqual([{ targetSettings: { channelId: 'C01' } }]);
  });

  it('shows the channel already chosen', async () => {
    render(
      <ModalPostPlatformSlack
        config={buildConfig({ channelId: 'C02' })}
        isEnabled
        isLoading={false}
        updatePlatformConfig={() => undefined}
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
        config={buildConfig()}
        isEnabled
        isLoading={false}
        updatePlatformConfig={() => undefined}
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

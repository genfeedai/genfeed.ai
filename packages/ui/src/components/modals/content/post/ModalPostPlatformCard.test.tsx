import '@testing-library/jest-dom/vitest';

import {
  CredentialPlatform,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IPostPlatformConfig } from '@genfeedai/contracts/interfaces';
import { render } from '@testing-library/react';
import ModalPostPlatformCard from '@ui/modals/content/post/ModalPostPlatformCard';
import { describe, expect, it, vi } from 'vitest';

function renderCard(scheduleTimezone: string) {
  const config: IPostPlatformConfig = {
    credentialId: 'cred-instagram',
    customScheduledDate: '2026-11-02T09:00',
    description: 'Instagram launch copy',
    enabled: true,
    handle: 'genfeed-instagram',
    label: 'Instagram launch',
    overrideSchedule: true,
    platform: CredentialPlatform.INSTAGRAM,
    targetExecutionState: TargetExecutionState.SCHEDULED,
    visibility: PostVisibility.PUBLIC,
  };

  return render(
    <ModalPostPlatformCard
      charLimit={2200}
      config={config}
      currentLength={0}
      generatingDescFor={null}
      generatingTitleFor={null}
      getMinDateTime={() => new Date('2026-10-17T22:30:00.000Z')}
      globalDescription=""
      globalLabel=""
      handleGenerateContent={vi.fn()}
      isEnabled
      isInstagram
      isLoading={false}
      isTwitter={false}
      isYoutube={false}
      scheduleTimezone={scheduleTimezone}
      updatePlatformConfig={vi.fn()}
    />,
  );
}

describe('ModalPostPlatformCard', () => {
  it('shows the earliest schedule time as wall-clock time in the schedule timezone', () => {
    const { container } = renderCard('Asia/Tokyo');

    expect(
      container.querySelector('input[type="datetime-local"]'),
    ).toHaveAttribute('min', '2026-10-18T07:30');
  });
});

'use client';

import { CredentialPlatform } from '@genfeedai/contracts';
import type { ModalPostSlackTargetsProps } from '@genfeedai/props/modals/modal.props';
import ModalPostPlatformSlack from '@/components/modals/content/post/ModalPostPlatformSlack';

/** One channel picker for each selected Slack workspace. */
export default function ModalPostSlackTargets({
  credentials,
  selectedCredentialIds,
  channelIds,
  isDisabled,
  onChannelChange,
}: ModalPostSlackTargetsProps) {
  const targets = credentials.filter(
    (credential) =>
      credential.platform === CredentialPlatform.SLACK &&
      selectedCredentialIds.includes(credential.id),
  );

  return targets.map((credential) => (
    <ModalPostPlatformSlack
      channelId={channelIds[credential.id] ?? ''}
      credentialId={credential.id}
      isLoading={isDisabled}
      key={credential.id}
      onChannelChange={(channelId) => onChannelChange(credential.id, channelId)}
    />
  ));
}

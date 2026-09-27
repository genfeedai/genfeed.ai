'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AgentFirstActionsProps } from '@props/website/agent-first-actions.props';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import Link from 'next/link';

/** Where every "Connect your agent" action lands: the client setup list. */
export const AGENT_CONNECT_HREF = '/agent#connect';

/*
  The product pages sell one path: point the agent you already use at Genfeed,
  then open the app for the review and publishing side. Sales demos are not a
  path; a call exists only for done-for-you work, on the services pages.
*/
export default function AgentFirstActions({
  signUpHref = `${EnvironmentService.apps.app}/sign-up`,
  signUpLabel = 'Start for $0',
  trackingName,
}: AgentFirstActionsProps): React.ReactElement {
  return (
    <>
      <ButtonTracked
        asChild
        size={ButtonSize.PUBLIC}
        trackingData={{ action: 'connect_agent' }}
        trackingName={trackingName}
      >
        <Link href={AGENT_CONNECT_HREF}>Connect your agent</Link>
      </ButtonTracked>
      <ButtonTracked
        asChild
        size={ButtonSize.PUBLIC}
        trackingData={{ action: 'start_signup' }}
        trackingName={trackingName}
        variant={ButtonVariant.SECONDARY}
      >
        <a href={signUpHref}>{signUpLabel}</a>
      </ButtonTracked>
    </>
  );
}

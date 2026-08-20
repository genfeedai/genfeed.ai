import { APP_ROUTES } from '@genfeedai/constants';
import { permanentRedirect } from 'next/navigation';

/** Legacy `/automate/:agentId` → nested `/automate/agents/:agentId`. */
export default async function AutomateAgentDetailLegacyRoute({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  permanentRedirect(`${APP_ROUTES.AUTOMATE.AGENTS}/${agentId}`);
}

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { permanentRedirect } from 'next/navigation';

/** Legacy `/automation/:agentId` → nested `/automation/agents/:agentId`. */
export default async function AutomationAgentDetailLegacyRoute({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  permanentRedirect(`${APP_ROUTES.AUTOMATION.AGENTS}/${agentId}`);
}

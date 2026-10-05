import AutomationAgentDetailRoute from '@app/(protected)/[orgSlug]/[brandSlug]/automation/agents/[agentId]/AutomationAgentDetailRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Agent Detail');

export default function AutomationAgentDetailPage() {
  return <AutomationAgentDetailRoute />;
}

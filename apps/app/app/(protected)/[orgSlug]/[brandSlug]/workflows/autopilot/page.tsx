import { APP_ROUTES } from '@genfeedai/constants';
import { redirect } from 'next/navigation';
import {
  buildLegacyWorkflowRouteRedirect,
  type LegacyWorkflowRouteSearchParams,
} from '../legacy-workflow-route';

interface LegacyWorkflowAutopilotPageProps {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
  searchParams: Promise<LegacyWorkflowRouteSearchParams>;
}

export default async function LegacyWorkflowAutopilotPage({
  params,
  searchParams,
}: LegacyWorkflowAutopilotPageProps) {
  const [{ brandSlug, orgSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);

  redirect(
    buildLegacyWorkflowRouteRedirect({
      brandSlug,
      destination: APP_ROUTES.ORCHESTRATION.AUTOPILOT,
      orgSlug,
      searchParams: resolvedSearchParams,
    }),
  );
}

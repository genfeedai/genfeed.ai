import type { SourceTool } from '../../../interfaces/source-tool.interface';
import { AGENT_ADS_TOOLS } from './ads.tools';
import { AGENT_AGENT_CONTROL_TOOLS } from './agent-control.tools';
import { AGENT_ANALYTICS_TOOLS } from './analytics.tools';
import { AGENT_BRAND_PROFILE_TOOLS } from './brand-profile.tools';
import { AGENT_CAMPAIGN_TOOLS } from './campaign.tools';
import { AGENT_CONTENT_TOOLS } from './content.tools';
import { AGENT_CONVERSATION_TRANSFER_TOOLS } from './conversation-transfer.tools';
import { AGENT_DASHBOARD_LAYOUT_TOOLS } from './dashboard-layout.tools';
import { AGENT_GENERATION_TOOLS } from './generation.tools';
import { AGENT_IDENTITY_TOOLS } from './identity.tools';
import { AGENT_ONBOARDING_TOOLS } from './onboarding.tools';
import { AGENT_OPERATOR_TOOLS } from './operator.tools';
import { AGENT_OTHER_TOOLS } from './other.tools';
import { AGENT_PROACTIVE_TOOLS } from './proactive.tools';
import { AGENT_SOCIAL_TOOLS } from './social.tools';
import { AGENT_UI_TOOLS } from './ui.tools';
import { AGENT_WORKFLOW_TOOLS } from './workflow.tools';

export const AGENT_ONLY_TOOLS: SourceTool[] = [
  ...AGENT_GENERATION_TOOLS,
  ...AGENT_OTHER_TOOLS,
  ...AGENT_OPERATOR_TOOLS,
  ...AGENT_CONTENT_TOOLS,
  ...AGENT_CONVERSATION_TRANSFER_TOOLS,
  ...AGENT_ANALYTICS_TOOLS,
  ...AGENT_SOCIAL_TOOLS,
  ...AGENT_CAMPAIGN_TOOLS,
  ...AGENT_ONBOARDING_TOOLS,
  ...AGENT_PROACTIVE_TOOLS,
  ...AGENT_IDENTITY_TOOLS,
  ...AGENT_UI_TOOLS,
  ...AGENT_DASHBOARD_LAYOUT_TOOLS,
  ...AGENT_AGENT_CONTROL_TOOLS,
  ...AGENT_WORKFLOW_TOOLS,
  ...AGENT_ADS_TOOLS,
  ...AGENT_BRAND_PROFILE_TOOLS,
];

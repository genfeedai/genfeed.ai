import type { SourceTool } from '../../../interfaces/source-tool.interface.js';
import { AGENT_AGENT_CONTROL_TOOLS } from './agent-control.tools.js';
import { AGENT_ANALYTICS_TOOLS } from './analytics.tools.js';
import { AGENT_CAMPAIGN_TOOLS } from './campaign.tools.js';
import { AGENT_CONTENT_TOOLS } from './content.tools.js';
import { AGENT_GENERATION_TOOLS } from './generation.tools.js';
import { AGENT_IDENTITY_TOOLS } from './identity.tools.js';
import { AGENT_ONBOARDING_TOOLS } from './onboarding.tools.js';
import { AGENT_OTHER_TOOLS } from './other.tools.js';
import { AGENT_PROACTIVE_TOOLS } from './proactive.tools.js';
import { AGENT_SOCIAL_TOOLS } from './social.tools.js';
import { AGENT_UI_TOOLS } from './ui.tools.js';
import { AGENT_WORKFLOW_TOOLS } from './workflow.tools.js';

export const AGENT_ONLY_TOOLS: SourceTool[] = [
  ...AGENT_GENERATION_TOOLS,
  ...AGENT_OTHER_TOOLS,
  ...AGENT_CONTENT_TOOLS,
  ...AGENT_ANALYTICS_TOOLS,
  ...AGENT_SOCIAL_TOOLS,
  ...AGENT_CAMPAIGN_TOOLS,
  ...AGENT_ONBOARDING_TOOLS,
  ...AGENT_PROACTIVE_TOOLS,
  ...AGENT_IDENTITY_TOOLS,
  ...AGENT_UI_TOOLS,
  ...AGENT_AGENT_CONTROL_TOOLS,
  ...AGENT_WORKFLOW_TOOLS,
];

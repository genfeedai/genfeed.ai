import type { SourceTool } from '../../../interfaces/source-tool.interface';
import { MCP_ADMIN_TOOLS } from './admin.tools';
import { MCP_ADS_TOOLS } from './ads.tools';
import { MCP_AGENT_CONTROL_TOOLS } from './agent-control.tools';
import { MCP_ANALYTICS_TOOLS } from './analytics.tools';
import { MCP_CAMPAIGN_TOOLS } from './campaign.tools';
import { MCP_CLIP_TOOLS } from './clips.tools';
import { MCP_CONTENT_TOOLS } from './content.tools';
import { MCP_GENERATION_TOOLS } from './generation.tools';
import { MCP_OTHER_TOOLS } from './other.tools';
import { MCP_SCHEDULER_TOOLS } from './scheduler.tools';
import { MCP_SKILLS_PRO_TOOLS } from './skills-pro.tools';
import { MCP_SOCIAL_TOOLS } from './social.tools';
import { MCP_WORKFLOW_TOOLS } from './workflow.tools';

export const MCP_ONLY_TOOLS: SourceTool[] = [
  ...MCP_GENERATION_TOOLS,
  ...MCP_ANALYTICS_TOOLS,
  ...MCP_CONTENT_TOOLS,
  ...MCP_OTHER_TOOLS,
  ...MCP_WORKFLOW_TOOLS,
  ...MCP_SOCIAL_TOOLS,
  ...MCP_ADMIN_TOOLS,
  ...MCP_AGENT_CONTROL_TOOLS,
  ...MCP_ADS_TOOLS,
  ...MCP_CAMPAIGN_TOOLS,
  ...MCP_CLIP_TOOLS,
  ...MCP_SCHEDULER_TOOLS,
  ...MCP_SKILLS_PRO_TOOLS,
];

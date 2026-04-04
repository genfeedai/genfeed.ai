import type {
  CanonicalToolDefinition,
  ToolCategory,
  ToolRequiredRole,
} from '../interfaces/tool-definition.interface';
import { AGENT_SOURCE_TOOLS } from './source.agent';
import { MCP_SOURCE_TOOLS } from './source.mcp';

const UI_ACTION_MAP: Partial<
  Record<string, CanonicalToolDefinition['uiActionType']>
> = {
  ai_action: 'ai_text_action_card',
  analyze_performance: 'analytics_snapshot_card',
  check_onboarding_status: 'onboarding_checklist_card',
  complete_campaign: 'campaign_control_card',
  connect_social_account: 'oauth_connect_card',
  create_brand: 'brand_create_card',
  create_campaign: 'campaign_create_card',
  discover_engagements: 'engagement_opportunity_card',
  generate_as_identity: 'generation_action_card',
  generate_content_batch: 'batch_generation_card',
  generate_image: 'generation_action_card',
  generate_music: 'generation_action_card',
  generate_video: 'generation_action_card',
  generate_voice: 'voice_clone_card',
  get_analytics: 'analytics_snapshot_card',
  get_campaign_analytics: 'analytics_snapshot_card',
  get_content_calendar: 'content_calendar_card',
  get_credits_balance: 'credits_balance_card',
  get_trends: 'trending_topics_card',
  initiate_oauth_connect: 'oauth_connect_card',
  list_review_queue: 'review_gate_card',
  open_studio_handoff: 'studio_handoff_card',
  pause_campaign: 'campaign_control_card',
  prepare_clip_workflow_run: 'clip_workflow_run_card',
  prepare_generation: 'generation_action_card',
  prepare_workflow_trigger: 'workflow_trigger_card',
  present_payment_options: 'payment_cta_card',
  reframe_image: 'image_transform_card',
  schedule_post: 'schedule_post_card',
  select_ingredient: 'ingredient_picker_card',
  start_campaign: 'campaign_control_card',
  suggest_ingredient_alternatives: 'ingredient_alternatives_card',
  upscale_image: 'image_transform_card',
};

function inferCategory(name: string): ToolCategory {
  if (name.includes('campaign')) return 'campaign';
  if (name.includes('onboarding') || name === 'create_brand')
    return 'onboarding';
  if (
    name.startsWith('prepare_') ||
    name === 'render_dashboard' ||
    name.includes('ingredient')
  )
    return 'ui';
  if (
    name.includes('analytics') ||
    name.includes('trends') ||
    name.includes('performance')
  )
    return 'analytics';
  if (name.includes('workflow')) return 'workflow';
  if (
    name.includes('post') ||
    name.includes('article') ||
    name.includes('content')
  )
    return 'content';
  if (
    name.includes('image') ||
    name.includes('video') ||
    name.includes('music') ||
    name.includes('voice') ||
    name.includes('avatar')
  )
    return 'generation';
  if (
    name.includes('oauth') ||
    name.includes('account') ||
    name.includes('brand') ||
    name.includes('social')
  )
    return 'social';
  if (
    name.includes('ads') ||
    name.startsWith('meta_') ||
    name.startsWith('google_') ||
    name.startsWith('list_meta_') ||
    name.startsWith('get_meta_') ||
    name.startsWith('list_google_') ||
    name.startsWith('get_google_')
  )
    return 'ads';
  if (
    name.includes('darkroom') ||
    name.includes('training') ||
    name.includes('dataset') ||
    name.includes('comfyui') ||
    name.includes('gpu') ||
    name.includes('loras')
  )
    return 'admin';
  if (
    name.includes('engagement') ||
    name.includes('approval') ||
    name.includes('strategy') ||
    name.includes('calendar')
  )
    return 'proactive';
  if (name.includes('identity')) return 'identity';
  if (name.includes('spawn') || name.includes('asset') || name.includes('chat'))
    return 'agent-control';
  return 'other';
}

const roleWeight: Record<ToolRequiredRole, number> = {
  admin: 1,
  superadmin: 2,
  user: 0,
};

function maxRole(a: ToolRequiredRole, b: ToolRequiredRole): ToolRequiredRole {
  return roleWeight[a] >= roleWeight[b] ? a : b;
}

function chooseBetterParameters(
  a: CanonicalToolDefinition['parameters'],
  b: CanonicalToolDefinition['parameters'],
): CanonicalToolDefinition['parameters'] {
  const aSize = Object.keys(a.properties).length;
  const bSize = Object.keys(b.properties).length;
  return bSize > aSize ? b : a;
}

const fromAgent: CanonicalToolDefinition[] = AGENT_SOURCE_TOOLS.map((tool) => ({
  category: inferCategory(tool.name),
  creditCost: tool.creditCost,
  description: tool.description,
  name: tool.name,
  parameters: tool.parameters,
  requiredRole: 'user',
  surfaces: {
    agent: true,
    cliAgentVisible: tool.surfaces?.cliAgentVisible ?? true,
    mcp: false,
  },
  uiActionType: UI_ACTION_MAP[tool.name],
}));

const fromMcp: CanonicalToolDefinition[] = MCP_SOURCE_TOOLS.map((tool) => ({
  category: inferCategory(tool.name),
  creditCost: 0,
  description: tool.description,
  name: tool.name,
  parameters: {
    properties: tool.inputSchema.properties,
    required: tool.inputSchema.required,
    type: 'object',
  },
  requiredRole: tool.requiredRole,
  surfaces: {
    agent: false,
    cliAgentVisible: tool.surfaces?.cliAgentVisible ?? false,
    mcp: true,
  },
  uiActionType: UI_ACTION_MAP[tool.name],
}));

const merged = new Map<string, CanonicalToolDefinition>();

for (const tool of [...fromAgent, ...fromMcp]) {
  const existing = merged.get(tool.name);
  if (!existing) {
    merged.set(tool.name, tool);
    continue;
  }

  merged.set(tool.name, {
    ...existing,
    category: existing.category === 'other' ? tool.category : existing.category,
    creditCost: existing.creditCost || tool.creditCost,
    description:
      tool.description.length > existing.description.length
        ? tool.description
        : existing.description,
    parameters: chooseBetterParameters(existing.parameters, tool.parameters),
    requiredRole: maxRole(existing.requiredRole, tool.requiredRole),
    surfaces: {
      agent: existing.surfaces.agent || tool.surfaces.agent,
      cliAgentVisible:
        existing.surfaces.cliAgentVisible || tool.surfaces.cliAgentVisible,
      mcp: existing.surfaces.mcp || tool.surfaces.mcp,
    },
    uiActionType: existing.uiActionType ?? tool.uiActionType,
  });
}

export const ALL_TOOLS: CanonicalToolDefinition[] = [...merged.values()].sort(
  (a, b) => a.name.localeCompare(b.name),
);

const toolsByName = new Map<string, CanonicalToolDefinition>(
  ALL_TOOLS.map((tool) => [tool.name, tool]),
);

export function getToolByName(
  name: string,
): CanonicalToolDefinition | undefined {
  return toolsByName.get(name);
}

export function getToolsForSurface(
  surface: 'agent' | 'mcp' | 'cli',
): CanonicalToolDefinition[] {
  return ALL_TOOLS.filter((tool) =>
    surface === 'cli' ? tool.surfaces.cliAgentVisible : tool.surfaces[surface],
  );
}

export function getToolsByCategory(
  category: ToolCategory,
): CanonicalToolDefinition[] {
  return ALL_TOOLS.filter((tool) => tool.category === category);
}

export function getToolsForRole(
  surface: 'agent' | 'mcp' | 'cli',
  role: ToolRequiredRole,
): CanonicalToolDefinition[] {
  const roleLevel = roleWeight[role];
  return getToolsForSurface(surface).filter(
    (tool) => roleWeight[tool.requiredRole] <= roleLevel,
  );
}

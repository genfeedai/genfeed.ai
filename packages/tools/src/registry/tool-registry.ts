import type {
  CanonicalToolDefinition,
  ToolCategory,
  ToolRequiredRole,
} from '../interfaces/tool-definition.interface.js';
import {
  CURATED_ACTION_CATALOG,
  isActionOnSurface,
} from './curated-action-catalog.js';
import { SOURCE_TOOLS } from './source/index.js';

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
    name === 'save_dashboard_layout' ||
    name === 'get_dashboard_layout' ||
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

const definitionsByName = new Map(
  SOURCE_TOOLS.map((tool) => [tool.name, tool]),
);
const catalogNames: ReadonlySet<string> = new Set(
  CURATED_ACTION_CATALOG.map((entry) => entry.name),
);

const duplicateDefinitionNames = SOURCE_TOOLS.filter(
  (tool, index) =>
    SOURCE_TOOLS.findIndex((candidate) => candidate.name === tool.name) !==
    index,
).map((tool) => tool.name);
const duplicateCatalogNames = CURATED_ACTION_CATALOG.filter(
  (entry, index) =>
    CURATED_ACTION_CATALOG.findIndex(
      (candidate) => candidate.name === entry.name,
    ) !== index,
).map((entry) => entry.name);
const missingDefinitions = CURATED_ACTION_CATALOG.filter(
  (entry) => !definitionsByName.has(entry.name),
).map((entry) => entry.name);
const unreviewedDefinitions = SOURCE_TOOLS.filter(
  (tool) => !catalogNames.has(tool.name),
).map((tool) => tool.name);

const catalogViolations = [
  duplicateDefinitionNames.length > 0
    ? `duplicate definitions: ${duplicateDefinitionNames.join(', ')}`
    : null,
  duplicateCatalogNames.length > 0
    ? `duplicate catalog entries: ${duplicateCatalogNames.join(', ')}`
    : null,
  missingDefinitions.length > 0
    ? `missing definitions: ${missingDefinitions.join(', ')}`
    : null,
  unreviewedDefinitions.length > 0
    ? `definitions absent from the curated catalog: ${unreviewedDefinitions.join(', ')}`
    : null,
].filter((violation): violation is string => violation !== null);

if (catalogViolations.length > 0) {
  throw new Error(
    `Invalid curated action catalog: ${catalogViolations.join('; ')}`,
  );
}

const CANONICAL_SOURCE_TOOLS: CanonicalToolDefinition[] =
  CURATED_ACTION_CATALOG.map((entry) => {
    const tool = definitionsByName.get(entry.name);
    if (!tool) {
      throw new Error(`Missing curated action definition: ${entry.name}`);
    }

    const agent = isActionOnSurface(entry, 'agent');
    return {
      category: inferCategory(tool.name),
      creditCost: tool.creditCost,
      description: tool.description,
      name: tool.name,
      parameters: tool.parameters,
      requiredRole: tool.requiredRole,
      surfaces: {
        agent,
        cliAgentVisible: agent,
        mcp: isActionOnSurface(entry, 'mcp'),
      },
      uiActionType: UI_ACTION_MAP[tool.name],
    };
  });

/**
 * Curated product actions only. HTTP endpoints remain documented by OpenAPI,
 * but they do not become Agent or MCP actions automatically.
 */
export const ALL_TOOLS: CanonicalToolDefinition[] = CANONICAL_SOURCE_TOOLS.sort(
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

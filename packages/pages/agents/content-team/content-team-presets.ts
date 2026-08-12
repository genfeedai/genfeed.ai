import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
} from '@genfeedai/enums';
import type { CreateAgentCampaignInput } from '@services/automation/agent-campaigns.service';
import type {
  AgentGoalMetric,
  CreateAgentGoalInput,
} from '@services/automation/agent-goals.service';
import type { CreateAgentStrategyInput } from '@services/automation/agent-strategies.service';

/**
 * Default seeded workflow template per content-team role.
 * Mirrors server `AGENT_TYPE_WORKFLOW_DEFAULTS` so hire/launch pins graphs.
 */
/** Shared with hire + wizard/autopilot create paths. */
export const ROLE_WORKFLOW_TEMPLATE_BY_TYPE: Partial<
  Record<AgentType, string>
> = {
  [AgentType.GENERAL]: 'founder-x-post',
  [AgentType.X_CONTENT]: 'founder-x-post',
  [AgentType.IMAGE_CREATOR]: 'founder-editorial-illustration',
  [AgentType.VIDEO_CREATOR]: 'social-media-video-series',
  [AgentType.AI_AVATAR]: 'avatar-ugc-heygen',
  [AgentType.ARTICLE_WRITER]: 'founder-newsletter',
  [AgentType.LINKEDIN_CONTENT]: 'founder-newsletter',
  [AgentType.ADS_SCRIPT_WRITER]: 'founder-x-post',
  [AgentType.SHORT_FORM_WRITER]: 'tiktok-slideshow-automation',
  [AgentType.CTA_CONTENT]: 'founder-x-post',
  [AgentType.YOUTUBE_SCRIPT]: 'youtube-thumbnail-script',
};

export function preferredWorkflowTemplateIdForAgentType(
  agentType: AgentType | string | undefined,
): string | undefined {
  if (!agentType) {
    return undefined;
  }
  return ROLE_WORKFLOW_TEMPLATE_BY_TYPE[agentType as AgentType];
}

const ROLE_SKILL_SLUGS_BY_TYPE: Partial<Record<AgentType, string[]>> = {
  [AgentType.X_CONTENT]: ['content-writing'],
  [AgentType.IMAGE_CREATOR]: ['image-generation'],
  [AgentType.VIDEO_CREATOR]: ['content-writing', 'image-generation'],
  [AgentType.AI_AVATAR]: ['content-writing'],
  [AgentType.ARTICLE_WRITER]: ['content-writing'],
  [AgentType.LINKEDIN_CONTENT]: ['content-writing'],
  [AgentType.ADS_SCRIPT_WRITER]: ['content-writing'],
  [AgentType.SHORT_FORM_WRITER]: ['content-writing'],
  [AgentType.CTA_CONTENT]: ['content-writing'],
  [AgentType.YOUTUBE_SCRIPT]: ['content-writing', 'image-generation'],
};

export interface ContentTeamRolePreset {
  defaultBudget: number;
  defaultLabel: string;
  description: string;
  displayRole: string;
  id: string;
  platforms: string[];
  preferredWorkflowTemplateId?: string;
  skillSlugs?: string[];
  teamGroup: string;
  type: AgentType;
}

export interface ContentTeamBlueprintPreset {
  description: string;
  id: string;
  label: string;
  roleIds: string[];
}

export interface BuildRoleStrategyInputOptions {
  brandId?: string;
  budget?: number;
  goalId?: string;
  label?: string;
  persona?: string;
  reportsToLabel?: string;
  rolePresetId: string;
  sharedTopic?: string;
  teamGroup?: string;
}

export interface BuildBlueprintOptions {
  brandId?: string;
  budgetOverrides?: Partial<Record<string, number>>;
  goalId?: string;
  persona?: string;
  reportsToLabel?: string;
  sharedTopic?: string;
  teamGroupOverrides?: Partial<Record<string, string>>;
}

function withWorkflowDefaults(
  preset: Omit<
    ContentTeamRolePreset,
    'preferredWorkflowTemplateId' | 'skillSlugs'
  >,
): ContentTeamRolePreset {
  return {
    ...preset,
    preferredWorkflowTemplateId:
      ROLE_WORKFLOW_TEMPLATE_BY_TYPE[preset.type] ?? undefined,
    skillSlugs: ROLE_SKILL_SLUGS_BY_TYPE[preset.type] ?? ['content-writing'],
  };
}

export const CONTENT_TEAM_ROLE_PRESETS: ContentTeamRolePreset[] = [
  withWorkflowDefaults({
    defaultBudget: 180,
    defaultLabel: 'Instagram Short Creator',
    description: 'Produces short-form creator videos for Instagram and TikTok.',
    displayRole: 'Instagram Short Creator',
    id: 'instagram-short-creator',
    platforms: ['instagram', 'tiktok'],
    teamGroup: 'Production',
    type: AgentType.VIDEO_CREATOR,
  }),
  withWorkflowDefaults({
    defaultBudget: 80,
    defaultLabel: 'X/Twitter Writer',
    description:
      'Turns ideas into posts, threads, and fast platform-native copy.',
    displayRole: 'X/Twitter Writer',
    id: 'x-twitter-writer',
    platforms: ['twitter'],
    teamGroup: 'Distribution',
    type: AgentType.X_CONTENT,
  }),
  withWorkflowDefaults({
    defaultBudget: 120,
    defaultLabel: 'Script Writer',
    description: 'Develops hooks, scripts, and long-form narrative drafts.',
    displayRole: 'Script Writer',
    id: 'script-writer',
    platforms: ['instagram', 'youtube'],
    teamGroup: 'Strategy',
    type: AgentType.ARTICLE_WRITER,
  }),
  withWorkflowDefaults({
    defaultBudget: 140,
    defaultLabel: 'Image/Carousel Creator',
    description: 'Builds carousels, stills, and visual support assets.',
    displayRole: 'Image/Carousel Creator',
    id: 'image-carousel-creator',
    platforms: ['instagram', 'linkedin'],
    teamGroup: 'Production',
    type: AgentType.IMAGE_CREATOR,
  }),
  withWorkflowDefaults({
    defaultBudget: 220,
    defaultLabel: 'AI Avatar Host',
    description: 'Fronts repeatable creator content using an avatar workflow.',
    displayRole: 'AI Avatar Host',
    id: 'ai-avatar-host',
    platforms: ['youtube', 'tiktok', 'instagram'],
    teamGroup: 'Production',
    type: AgentType.AI_AVATAR,
  }),
  withWorkflowDefaults({
    defaultBudget: 100,
    defaultLabel: 'LinkedIn Copywriter',
    description:
      'Writes thought leadership posts, articles, and professional engagement copy for LinkedIn.',
    displayRole: 'LinkedIn Copywriter',
    id: 'linkedin-copywriter',
    platforms: ['linkedin'],
    teamGroup: 'Distribution',
    type: AgentType.LINKEDIN_CONTENT,
  }),
  withWorkflowDefaults({
    defaultBudget: 150,
    defaultLabel: 'Ads Script Writer',
    description:
      'Produces video ad scripts, hook variations, and performance marketing copy.',
    displayRole: 'Ads Script Writer',
    id: 'ads-script-writer',
    platforms: ['instagram', 'tiktok', 'youtube', 'facebook'],
    teamGroup: 'Strategy',
    type: AgentType.ADS_SCRIPT_WRITER,
  }),
  withWorkflowDefaults({
    defaultBudget: 100,
    defaultLabel: 'TikTok/IG Hook Writer',
    description:
      'Writes hooks, captions, and text overlays for TikTok and Instagram Reels.',
    displayRole: 'Short-Form Writer',
    id: 'short-form-writer',
    platforms: ['tiktok', 'instagram'],
    teamGroup: 'Distribution',
    type: AgentType.SHORT_FORM_WRITER,
  }),
  withWorkflowDefaults({
    defaultBudget: 80,
    defaultLabel: 'CTA / Conversion Writer',
    description:
      'Creates CTAs, conversion copy, lead magnets, and action-driving micro-content.',
    displayRole: 'CTA / Conversion Writer',
    id: 'cta-conversion-writer',
    platforms: ['instagram', 'linkedin', 'twitter', 'youtube'],
    teamGroup: 'Strategy',
    type: AgentType.CTA_CONTENT,
  }),
  withWorkflowDefaults({
    defaultBudget: 200,
    defaultLabel: 'YouTube Scriptwriter',
    description:
      'Writes YouTube video scripts, titles, descriptions, and Shorts scripts.',
    displayRole: 'YouTube Scriptwriter',
    id: 'youtube-scriptwriter',
    platforms: ['youtube'],
    teamGroup: 'Production',
    type: AgentType.YOUTUBE_SCRIPT,
  }),
];

export const CONTENT_TEAM_BLUEPRINT_PRESETS: ContentTeamBlueprintPreset[] = [
  {
    description:
      'Launches a compact creator team with strategy, short-form, distribution, and design coverage.',
    id: 'creator-studio',
    label: 'Creator Studio Blueprint',
    roleIds: [
      'script-writer',
      'instagram-short-creator',
      'x-twitter-writer',
      'image-carousel-creator',
    ],
  },
];

function getRolePreset(rolePresetId: string): ContentTeamRolePreset {
  const preset = CONTENT_TEAM_ROLE_PRESETS.find(
    (item) => item.id === rolePresetId,
  );
  if (!preset) {
    throw new Error(`Unknown content team role preset: ${rolePresetId}`);
  }

  return preset;
}

function buildVoiceContext(
  persona?: string,
  sharedTopic?: string,
): string | undefined {
  const segments = [persona?.trim(), sharedTopic?.trim()]
    .filter((segment): segment is string => Boolean(segment))
    .map((segment, index) =>
      index === 0 ? `Persona: ${segment}` : `Priority topic: ${segment}`,
    );

  return segments.length > 0 ? segments.join(' | ') : undefined;
}

export function buildRoleStrategyInput(
  options: BuildRoleStrategyInputOptions,
): CreateAgentStrategyInput {
  const preset = getRolePreset(options.rolePresetId);
  const resolvedBudget = options.budget ?? preset.defaultBudget;

  return {
    agentType: preset.type,
    autonomyMode: AgentAutonomyMode.SUPERVISED,
    brandId: options.brandId,
    dailyCreditBudget: resolvedBudget,
    displayRole: preset.displayRole,
    goalId: options.goalId,
    isActive: true,
    label: options.label?.trim() || preset.defaultLabel,
    minCreditThreshold: Math.max(25, Math.floor(resolvedBudget / 2)),
    platforms: preset.platforms,
    preferredWorkflowTemplateId: preset.preferredWorkflowTemplateId,
    skillSlugs: preset.skillSlugs,
    postsPerWeek: 7,
    reportsToLabel: options.reportsToLabel?.trim() || 'Main Orchestrator',
    runFrequency: AgentRunFrequency.DAILY,
    teamGroup: options.teamGroup?.trim() || preset.teamGroup,
    topics: options.sharedTopic?.trim() ? [options.sharedTopic.trim()] : [],
    voice: buildVoiceContext(options.persona, options.sharedTopic),
    weeklyCreditBudget: resolvedBudget * 5,
  };
}

export function buildBlueprintStrategyInputs(
  blueprintId: string,
  options: BuildBlueprintOptions = {},
): CreateAgentStrategyInput[] {
  const blueprint = CONTENT_TEAM_BLUEPRINT_PRESETS.find(
    (item) => item.id === blueprintId,
  );

  if (!blueprint) {
    throw new Error(`Unknown content team blueprint: ${blueprintId}`);
  }

  return blueprint.roleIds.map((roleId) =>
    buildRoleStrategyInput({
      brandId: options.brandId,
      budget: options.budgetOverrides?.[roleId],
      goalId: options.goalId,
      persona: options.persona,
      reportsToLabel: options.reportsToLabel,
      rolePresetId: roleId,
      sharedTopic: options.sharedTopic,
      teamGroup: options.teamGroupOverrides?.[roleId],
    }),
  );
}

export function buildContentTeamCampaignInput(options: {
  agentIds: string[];
  brief?: string;
  campaignLeadStrategyId?: string;
  creditsAllocated?: number;
  label: string;
  startDate?: string;
}): CreateAgentCampaignInput {
  return {
    agentStrategyIds: options.agentIds,
    brief: options.brief?.trim() || undefined,
    campaignLeadStrategyId: options.campaignLeadStrategyId,
    creditsAllocated: options.creditsAllocated ?? 0,
    label: options.label.trim(),
    startDate: options.startDate ?? new Date().toISOString(),
    status: 'draft',
  };
}

export function buildContentTeamGoalInput(options: {
  brandId?: string;
  description?: string;
  label: string;
  metric?: AgentGoalMetric;
  targetValue: number;
}): CreateAgentGoalInput {
  return {
    brandId: options.brandId,
    description: options.description?.trim() || undefined,
    isActive: true,
    label: options.label.trim(),
    metric: options.metric ?? 'views',
    targetValue: options.targetValue,
  };
}

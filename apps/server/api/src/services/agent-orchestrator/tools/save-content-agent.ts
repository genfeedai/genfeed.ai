import type { UpdateAgentStrategyDto } from '@api/collections/agent-strategies/dto/update-agent-strategy.dto';
import type { AgentStrategyCreateInput } from '@api/collections/agent-strategies/services/agent-strategies.service';
import type { AgentInitiatingPrincipal } from '@api/services/agent-orchestrator/utils/agent-initiating-principal.util';
import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
  parsePlatform,
} from '@genfeedai/contracts';

const MAX_LABEL_LENGTH = 200;
const MAX_TOPIC_LENGTH = 200;
const MAX_TOPICS = 20;
const MAX_VOICE_LENGTH = 2000;
const DEFAULT_POSTS_PER_WEEK = 7;
const DEFAULT_DAILY_CREDIT_BUDGET = 100;

const AGENT_TYPES = new Set<string>(Object.values(AgentType));
const RUN_FREQUENCIES = new Set<string>(Object.values(AgentRunFrequency));

export type SaveContentAgentRequest =
  | {
      autoPublish?: boolean;
      agentType?: AgentType;
      brandId: string;
      label: string;
      mode: 'create';
      platforms?: string[];
      postsPerWeek?: number;
      runFrequency?: AgentRunFrequency;
      topics?: string[];
      voice?: string;
    }
  | {
      autoPublish?: boolean;
      agentType?: AgentType;
      brandId?: string;
      label?: string;
      mode: 'update';
      platforms?: string[];
      postsPerWeek?: number;
      runFrequency?: AgentRunFrequency;
      strategyId: string;
      topics?: string[];
      voice?: string;
    };

export function parseSaveContentAgentArgs(
  params: Record<string, unknown>,
): SaveContentAgentRequest | string {
  const strategyId = readOptionalId(params.strategyId);
  if (strategyId === 'invalid') {
    return 'strategyId must be a non-empty string';
  }

  const label = readOptionalBoundedText(params.label, MAX_LABEL_LENGTH);
  if (label === 'invalid') {
    return `label must be a non-empty string up to ${MAX_LABEL_LENGTH} characters`;
  }

  const brandId = readOptionalId(params.brandId);
  if (brandId === 'invalid') {
    return 'brandId must be a non-empty string';
  }

  const agentType = readEnum(params.agentType, AGENT_TYPES);
  if (agentType === 'invalid') {
    return 'agentType is not a content agent type';
  }

  const topics = readStringList(params.topics, MAX_TOPICS, MAX_TOPIC_LENGTH);
  if (topics === 'invalid') {
    return `topics must be at most ${MAX_TOPICS} short strings`;
  }

  const voice = readOptionalBoundedText(params.voice, MAX_VOICE_LENGTH);
  if (voice === 'invalid') {
    return `voice must be text up to ${MAX_VOICE_LENGTH} characters`;
  }

  const platforms = readPlatforms(params.platforms);
  if (typeof platforms === 'string') {
    return platforms;
  }

  const postsPerWeek = readPostsPerWeek(params.postsPerWeek);
  if (postsPerWeek === 'invalid') {
    return 'postsPerWeek must be a whole number from 1 to 100';
  }

  const runFrequency = readEnum(params.runFrequency, RUN_FREQUENCIES);
  if (runFrequency === 'invalid') {
    return 'runFrequency must be every_6_hours, twice_daily, or daily';
  }

  const autoPublish = readOptionalBoolean(params.autoPublish);
  if (autoPublish === 'invalid') {
    return 'autoPublish must be true or false';
  }

  const shared = {
    ...(agentType !== undefined ? { agentType: agentType as AgentType } : {}),
    ...(autoPublish !== undefined ? { autoPublish } : {}),
    ...(platforms !== undefined ? { platforms } : {}),
    ...(postsPerWeek !== undefined ? { postsPerWeek } : {}),
    ...(runFrequency !== undefined
      ? { runFrequency: runFrequency as AgentRunFrequency }
      : {}),
    ...(topics !== undefined ? { topics } : {}),
    ...(voice !== undefined ? { voice } : {}),
  };

  if (strategyId === undefined) {
    if (label === undefined) {
      return 'label is required to create a content agent';
    }
    if (brandId === undefined) {
      return 'brandId is required to create a content agent';
    }
    return { ...shared, brandId, label, mode: 'create' };
  }

  return {
    ...shared,
    ...(brandId !== undefined ? { brandId } : {}),
    ...(label !== undefined ? { label } : {}),
    mode: 'update',
    strategyId,
  };
}

export function resolveContentAgentPrincipal(
  principal: AgentInitiatingPrincipal | undefined,
  organizationId: string,
): AgentInitiatingPrincipal | undefined | 'foreign' {
  if (!principal) {
    return undefined;
  }
  if (principal.organizationId !== organizationId) {
    return 'foreign';
  }
  return principal;
}

export function buildContentAgentCreateInput(input: {
  organizationId: string;
  principal?: AgentInitiatingPrincipal;
  request: Extract<SaveContentAgentRequest, { mode: 'create' }>;
  userId: string;
}): AgentStrategyCreateInput {
  const isAutoPublish = input.request.autoPublish === true;
  return {
    agentType: input.request.agentType ?? AgentType.GENERAL,
    autonomyMode: isAutoPublish
      ? AgentAutonomyMode.AUTO_PUBLISH
      : AgentAutonomyMode.SUPERVISED,
    brandId: input.request.brandId,
    dailyCreditBudget: DEFAULT_DAILY_CREDIT_BUDGET,
    isActive: true,
    label: input.request.label,
    organizationId: input.organizationId,
    ...(input.request.platforms !== undefined
      ? { platforms: input.request.platforms }
      : {}),
    postsPerWeek: input.request.postsPerWeek ?? DEFAULT_POSTS_PER_WEEK,
    publishPolicy: { autoPublishEnabled: isAutoPublish },
    runFrequency: input.request.runFrequency ?? AgentRunFrequency.DAILY,
    ...(input.principal ? { schedulePrincipal: input.principal } : {}),
    ...(input.request.topics !== undefined
      ? { topics: input.request.topics }
      : {}),
    userId: input.userId,
    ...(input.request.voice !== undefined
      ? { voice: input.request.voice }
      : {}),
  };
}

export function buildContentAgentUpdateInput(input: {
  principal?: AgentInitiatingPrincipal;
  request: Extract<SaveContentAgentRequest, { mode: 'update' }>;
}): UpdateAgentStrategyDto & {
  schedulePrincipal?: AgentInitiatingPrincipal;
} {
  const request = input.request;
  const isAutoPublish = request.autoPublish === true;
  return {
    ...(request.agentType !== undefined
      ? { agentType: request.agentType }
      : {}),
    ...(request.autoPublish !== undefined
      ? {
          autonomyMode: isAutoPublish
            ? AgentAutonomyMode.AUTO_PUBLISH
            : AgentAutonomyMode.SUPERVISED,
          publishPolicy: { autoPublishEnabled: isAutoPublish },
        }
      : {}),
    ...(request.label !== undefined ? { label: request.label } : {}),
    ...(request.platforms !== undefined
      ? { platforms: request.platforms }
      : {}),
    ...(request.postsPerWeek !== undefined
      ? { postsPerWeek: request.postsPerWeek }
      : {}),
    ...(request.runFrequency !== undefined
      ? { runFrequency: request.runFrequency }
      : {}),
    ...(input.principal ? { schedulePrincipal: input.principal } : {}),
    ...(request.topics !== undefined ? { topics: request.topics } : {}),
    ...(request.voice !== undefined ? { voice: request.voice } : {}),
  };
}

function readOptionalId(value: unknown): string | undefined | 'invalid' {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'invalid';
  }
  return value.trim();
}

function readOptionalBoundedText(
  value: unknown,
  maxLength: number,
): string | undefined | 'invalid' {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return 'invalid';
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return 'invalid';
  }
  return trimmed;
}

function readOptionalBoolean(value: unknown): boolean | undefined | 'invalid' {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    return 'invalid';
  }
  return value;
}

function readEnum(
  value: unknown,
  allowed: Set<string>,
): string | undefined | 'invalid' {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !allowed.has(value)) {
    return 'invalid';
  }
  return value;
}

function readPostsPerWeek(value: unknown): number | undefined | 'invalid' {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 100
  ) {
    return 'invalid';
  }
  return value;
}

function readStringList(
  value: unknown,
  maxItems: number,
  maxLength: number,
): string[] | undefined | 'invalid' {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length > maxItems) {
    return 'invalid';
  }
  const topics: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      return 'invalid';
    }
    const trimmed = item.trim();
    if (trimmed.length === 0 || trimmed.length > maxLength) {
      return 'invalid';
    }
    topics.push(trimmed);
  }
  return topics;
}

function readPlatforms(value: unknown): string[] | undefined | string {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return 'platforms must be a list of platform names';
  }
  const platforms: string[] = [];
  for (const item of value) {
    const platform = parsePlatform(item);
    if (!platform) {
      return 'platforms contains an unknown platform';
    }
    if (!platforms.includes(platform)) {
      platforms.push(platform);
    }
  }
  return platforms;
}

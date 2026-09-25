import type { AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import type {
  AssembledBrandContext,
  BrandContextBudgetResult,
} from '@api/services/agent-context-assembly/interfaces/context-assembly.interface';
import { KnowledgeMemoryScope } from '@genfeedai/contracts';
import type {
  AgentBrandContextEditTarget,
  AgentBrandContextLayerKey,
  IAgentBrandContextBudget,
  IAgentBrandContextKnowledgeEntry,
  IAgentBrandContextLayerStatus,
  IAgentBrandContextLayers,
  IAgentBrandContextMemory,
  IAgentBrandContextSnapshot,
  IAgentBrandContextTrimmedSection,
  IBrandConversationStarter,
  IBrandPromptSeed,
} from '@genfeedai/contracts/interfaces';
import type { ResolvedRuntimeSkill } from '@genfeedai/contracts/interfaces/ai';

/** Headers `AgentContextAssemblyService.buildSystemPrompt` renders per layer. */
const LAYER_HEADERS: Partial<Record<AgentBrandContextLayerKey, string[]>> = {
  guidelines: ['## Brand Guidelines'],
  identity: ['## Brand: '],
  knowledge: [
    '## Brand Knowledge',
    '## Retrieved Brand Memory',
    '## Relevant Knowledge',
  ],
  patterns: ['## Proven Creative Patterns'],
  performanceInsights: ['## Performance Insights'],
  persona: ['## Custom Instructions'],
  recentPosts: ['## Recent Posts'],
  strategy: ['## Content Strategy'],
  visualIdentity: ['## Visual Identity'],
  voice: [
    '## Brand Voice',
    '## Voice Example',
    '## Real Posts by This Brand',
    '## Reference Exemplars',
  ],
};

const LAYER_EDIT_TARGETS: Record<
  AgentBrandContextLayerKey,
  AgentBrandContextEditTarget
> = {
  guidelines: 'kit',
  identity: 'profile',
  knowledge: 'knowledge',
  memories: 'memory',
  patterns: 'memory',
  performanceInsights: 'memory',
  persona: 'voice',
  prompting: 'voice',
  recentPosts: 'profile',
  skills: 'skills',
  strategy: 'voice',
  visualIdentity: 'kit',
  voice: 'voice',
};

const LAYER_ORDER: AgentBrandContextLayerKey[] = [
  'identity',
  'guidelines',
  'visualIdentity',
  'voice',
  'strategy',
  'persona',
  'prompting',
  'performanceInsights',
  'patterns',
  'knowledge',
  'recentPosts',
  'memories',
  'skills',
];

export interface BrandAgentConfigSource {
  prompting?: {
    conversationStarters?: unknown;
    seeds?: unknown;
  };
  strategy?: {
    topics?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === 'string' && item.trim().length > 0,
      )
    : [];
}

export function readBrandAgentConfig(value: unknown): BrandAgentConfigSource {
  if (!isRecord(value)) {
    return {};
  }
  return {
    prompting: isRecord(value.prompting) ? value.prompting : undefined,
    strategy: isRecord(value.strategy) ? value.strategy : undefined,
  };
}

function readSeeds(value: unknown): IBrandPromptSeed[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord).map((seed) => ({
    angle: readString(seed.angle) ?? '',
    audience: readString(seed.audience) ?? '',
    preferredFormats: readStringList(seed.preferredFormats),
    topic: readString(seed.topic) ?? '',
  }));
}

function readStarters(value: unknown): IBrandConversationStarter[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord).map((starter) => {
    const intent = starter.intent;
    return {
      id: readString(starter.id) ?? '',
      intent:
        intent === 'analyze' || intent === 'plan' || intent === 'create'
          ? intent
          : 'create',
      label: readString(starter.label) ?? '',
      prompt: readString(starter.prompt) ?? '',
      topic: readString(starter.topic) ?? '',
    };
  });
}

function readKnowledgeEntries(
  context: AssembledBrandContext,
): IAgentBrandContextKnowledgeEntry[] {
  const brandKnowledge: IAgentBrandContextKnowledgeEntry[] = (
    context.brandKnowledgeEntries ?? []
  ).map((entry) => ({
    content: entry.content,
    origin: 'brand_knowledge',
    relevance: entry.relevance,
    source: entry.citation.title,
    sourceId: entry.citation.sourceId,
  }));
  const contextMemory: IAgentBrandContextKnowledgeEntry[] = (
    context.ragEntries ?? []
  ).map((entry) => ({
    content: entry.content,
    origin: 'context_memory',
    relevance: entry.relevance,
    source: entry.source,
    ...(entry.contextBaseId ? { sourceId: entry.contextBaseId } : {}),
  }));
  return [...brandKnowledge, ...contextMemory];
}

export function buildSnapshotLayers(
  context: AssembledBrandContext | null,
  fallback: { brandName: string; description?: string },
  agentConfig: BrandAgentConfigSource,
): IAgentBrandContextLayers {
  const assembledTopics = readStringList(context?.strategy?.topics);
  const storedTopics = readStringList(agentConfig.strategy?.topics);
  const topics = assembledTopics.length > 0 ? assembledTopics : storedTopics;
  const voice = context?.voice;
  const strategy = context?.strategy;
  const visualIdentity = context?.visualIdentity;
  const hasStrategy = Boolean(strategy) || topics.length > 0;

  return {
    guidelines: context?.promptGuidelines,
    identity: {
      description: context?.brandDescription ?? fallback.description,
      name: context?.brandName ?? fallback.brandName,
    },
    knowledge: context ? readKnowledgeEntries(context) : [],
    patterns: (context?.topPatterns ?? []).map((pattern) => ({
      avgPerformanceScore: pattern.avgPerformanceScore,
      formula: pattern.formula,
      label: pattern.label,
      patternType: pattern.patternType,
    })),
    performanceInsights: (context?.memoryInsights ?? []).map((insight) => ({
      category: insight.category,
      confidence: insight.confidence,
      insight: insight.insight,
    })),
    persona: context?.persona,
    prompting: {
      conversationStarters: readStarters(
        agentConfig.prompting?.conversationStarters,
      ),
      seeds: readSeeds(agentConfig.prompting?.seeds),
    },
    recentPosts: context?.recentPostSummaries ?? [],
    ...(hasStrategy
      ? {
          strategy: {
            contentTypes: strategy?.contentTypes ?? [],
            frequency: strategy?.frequency,
            goals: strategy?.goals ?? [],
            platforms: strategy?.platforms ?? [],
            topics,
          },
        }
      : {}),
    ...(visualIdentity
      ? {
          visualIdentity: {
            backgroundColor: visualIdentity.backgroundColor,
            bannerUrl: visualIdentity.bannerUrl,
            fontFamily: visualIdentity.fontFamily,
            logoUrl: visualIdentity.logoUrl,
            primaryColor: visualIdentity.primaryColor,
            referenceImageCount: visualIdentity.referenceImages?.length ?? 0,
            secondaryColor: visualIdentity.secondaryColor,
          },
        }
      : {}),
    ...(voice
      ? {
          voice: {
            approvedHooks: voice.approvedHooks ?? [],
            audience: voice.audience,
            bannedPhrases: voice.bannedPhrases ?? [],
            canonicalSource: voice.canonicalSource,
            doNotSoundLike: voice.doNotSoundLike ?? [],
            exemplarTexts: voice.exemplarTexts ?? [],
            hashtags: voice.hashtags ?? [],
            messagingPillars: voice.messagingPillars ?? [],
            sampleOutput: voice.sampleOutput,
            style: voice.style,
            taglines: voice.taglines ?? [],
            tone: voice.tone,
            values: voice.values ?? [],
            writingRules: voice.writingRules ?? [],
          },
        }
      : {}),
  };
}

function isLayerEmpty(
  key: AgentBrandContextLayerKey,
  layers: IAgentBrandContextLayers,
  memoryCount: number,
  skillCount: number,
): boolean {
  switch (key) {
    case 'identity':
      return !layers.identity.name;
    case 'guidelines':
      return !layers.guidelines;
    case 'visualIdentity':
      return !layers.visualIdentity;
    case 'voice':
      return !layers.voice;
    case 'strategy':
      return !layers.strategy;
    case 'persona':
      return !layers.persona;
    case 'prompting':
      return (
        layers.prompting.seeds.length === 0 &&
        layers.prompting.conversationStarters.length === 0
      );
    case 'performanceInsights':
      return layers.performanceInsights.length === 0;
    case 'patterns':
      return layers.patterns.length === 0;
    case 'knowledge':
      return layers.knowledge.length === 0;
    case 'recentPosts':
      return layers.recentPosts.length === 0;
    case 'memories':
      return memoryCount === 0;
    case 'skills':
      return skillCount === 0;
  }
}

function isPromptingInjected(
  layers: IAgentBrandContextLayers,
  prompt: string,
): boolean {
  const probes = [
    ...layers.prompting.conversationStarters.map((starter) => starter.prompt),
    ...layers.prompting.seeds.map((seed) => seed.angle),
  ].filter((probe) => probe.trim().length > 0);
  return probes.some((probe) => prompt.includes(probe));
}

export function buildLayerStatus(input: {
  layers: IAgentBrandContextLayers;
  memoryCount: number;
  memoryPrompt: string;
  skillCount: number;
  systemPrompt: string;
}): IAgentBrandContextLayerStatus[] {
  return LAYER_ORDER.map((key) => {
    const isEmpty = isLayerEmpty(
      key,
      input.layers,
      input.memoryCount,
      input.skillCount,
    );
    let isInjected = false;
    if (!isEmpty) {
      if (key === 'memories') {
        isInjected = input.memoryPrompt.length > 0;
      } else if (key === 'skills') {
        isInjected = input.skillCount > 0;
      } else if (key === 'prompting') {
        isInjected = isPromptingInjected(input.layers, input.systemPrompt);
      } else {
        isInjected = (LAYER_HEADERS[key] ?? []).some((header) =>
          input.systemPrompt.includes(header),
        );
      }
    }
    return {
      editTarget: LAYER_EDIT_TARGETS[key],
      isEmpty,
      isInjected,
      key,
    };
  });
}

/**
 * Maps the assembler's budget report for the brand-context block onto the
 * snapshot contract: what reached the prompt, the cap, and every section the
 * budget shortened or dropped.
 */
export function toSnapshotBudget(
  report: BrandContextBudgetResult | null,
  defaultCapChars: number,
): IAgentBrandContextBudget {
  if (!report) {
    return {
      capChars: defaultCapChars,
      isTrimmed: false,
      trimmedSections: [],
      untrimmedChars: 0,
      usedChars: 0,
    };
  }
  return {
    capChars: report.maxLength ?? defaultCapChars,
    isTrimmed: report.isTrimmed,
    trimmedSections: report.sections
      .filter((section) => section.status !== 'kept')
      .map(
        (section): IAgentBrandContextTrimmedSection => ({
          header: section.header,
          isDropped: section.status === 'dropped',
          keptChars: section.renderedLength,
          originalChars: section.originalLength,
        }),
      ),
    untrimmedChars: report.untrimmedLength,
    usedChars: report.text.length,
  };
}

/**
 * Personal memories are private to their author. The ranker already scopes
 * them; this second check keeps another user's row out of a snapshot even if
 * that upstream contract regresses.
 */
export function toSnapshotMemories(
  memories: AgentMemoryDocument[],
  requesterUserId: string,
): IAgentBrandContextMemory[] {
  return memories
    .filter(
      (memory) =>
        memory.scope !== KnowledgeMemoryScope.PERSONAL ||
        memory.userId === requesterUserId,
    )
    .map((memory) => {
      const influence = (memory as { generationInfluence?: { score?: number } })
        .generationInfluence;
      const createdAt = memory.createdAt;
      return {
        brandId: memory.brandId,
        content: memory.content,
        contentType: memory.contentType,
        ...(createdAt instanceof Date
          ? { createdAt: createdAt.toISOString() }
          : {}),
        id: memory.id,
        isOwnedByRequester:
          memory.scope === KnowledgeMemoryScope.PERSONAL &&
          memory.userId === requesterUserId,
        kind: memory.kind,
        platform: memory.platform,
        ...(typeof influence?.score === 'number'
          ? { score: influence.score }
          : {}),
        scope: memory.scope,
        summary: memory.summary,
      };
    });
}

export function toSnapshotSkills(
  skills: ResolvedRuntimeSkill[],
): IAgentBrandContextSnapshot['skills'] {
  return skills.map((skill) => ({
    isBuiltIn: skill.isBuiltIn === true,
    name: skill.name,
    slug: skill.slug,
    ...(skill.source ? { source: skill.source } : {}),
  }));
}

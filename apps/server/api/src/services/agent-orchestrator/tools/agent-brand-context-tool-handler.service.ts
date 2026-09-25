import { AgentBrandContextSnapshotService } from '@api/services/agent-orchestrator/agent-brand-context-snapshot.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import type {
  AgentToolResult,
  IAgentBrandContextLayers,
  IAgentBrandContextSnapshot,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

const BRAND_CONTEXT_TOOLS = ['get_brand_context'] as const;

type BrandContextToolName = (typeof BRAND_CONTEXT_TOOLS)[number];

/** Keeps the tool result inside a reasonable share of the model's context. */
const MAX_TEXT_CHARS = 400;
const MAX_LIST_ITEMS = 12;
const MAX_MEMORIES = 8;
const MAX_SYSTEM_PROMPT_CHARS = 12_000;
const AGENT_CONTEXT_SETTINGS_PATH = '/settings/agent-context';

function clip(value: string | undefined, max = MAX_TEXT_CHARS) {
  if (!value) {
    return value;
  }
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function clipList<T>(values: T[], max = MAX_LIST_ITEMS): T[] {
  return values.slice(0, max);
}

/**
 * `get_brand_context`: the brand context snapshot the settings page renders,
 * summarized for a tool result. Agent and MCP (through the agent-tools proxy)
 * share this one executor, so both surfaces see what the UI shows.
 */
@Injectable()
export class AgentBrandContextToolHandler {
  constructor(
    private readonly snapshotService: AgentBrandContextSnapshotService,
  ) {}

  execute(
    toolName: BrandContextToolName,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (toolName) {
      case 'get_brand_context':
        return this.getBrandContext(params, ctx);
    }
  }

  async getBrandContext(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brandId =
      readOptionalString(params.brandId) ??
      ctx.validatedScope?.brandId ??
      ctx.brandId;
    if (!brandId) {
      return {
        creditsUsed: 0,
        error:
          'get_brand_context requires a brand. Select a brand for this conversation first.',
        success: false,
      };
    }

    const snapshot = await this.snapshotService.buildSnapshot({
      brandId,
      organizationId: ctx.organizationId,
      query: readOptionalString(params.query),
      userId: ctx.userId,
    });

    return {
      creditsUsed: 0,
      data: this.summarize(snapshot, params.includeSystemPrompt !== false),
      success: true,
    };
  }

  private summarize(
    snapshot: IAgentBrandContextSnapshot,
    includeSystemPrompt: boolean,
  ): Record<string, unknown> {
    const gaps = snapshot.layerStatus
      .filter((status) => status.isEmpty)
      .map((status) => ({ editIn: status.editTarget, layer: status.key }));

    return {
      brandId: snapshot.brandId,
      brandName: snapshot.brandName,
      budget: snapshot.budget,
      gaps,
      layerStatus: snapshot.layerStatus.map((status) => ({
        editIn: status.editTarget,
        isEmpty: status.isEmpty,
        isInjected: status.isInjected,
        layer: status.key,
      })),
      layers: this.summarizeLayers(snapshot.layers),
      memories: snapshot.memories.slice(0, MAX_MEMORIES).map((memory) => ({
        id: memory.id,
        kind: memory.kind,
        scope: memory.scope,
        summary: clip(memory.summary || memory.content || '', 160),
      })),
      model: snapshot.model,
      query: snapshot.query,
      settingsPath: AGENT_CONTEXT_SETTINGS_PATH,
      skills: snapshot.skills.map((skill) => ({
        name: skill.name,
        slug: skill.slug,
      })),
      ...(includeSystemPrompt
        ? {
            memoryPrompt: snapshot.memoryPrompt,
            systemPrompt: clip(snapshot.systemPrompt, MAX_SYSTEM_PROMPT_CHARS),
            systemPromptChars: snapshot.systemPrompt.length,
          }
        : {}),
    };
  }

  private summarizeLayers(
    layers: IAgentBrandContextLayers,
  ): Record<string, unknown> {
    return {
      guidelines: clip(layers.guidelines),
      identity: {
        description: clip(layers.identity.description),
        name: layers.identity.name,
      },
      knowledge: clipList(layers.knowledge, 6).map((entry) => ({
        content: clip(entry.content, 240),
        origin: entry.origin,
        source: entry.source,
        sourceId: entry.sourceId,
      })),
      patterns: clipList(layers.patterns, 5),
      performanceInsights: clipList(layers.performanceInsights, 5),
      persona: clip(layers.persona),
      prompting: {
        conversationStarters: clipList(
          layers.prompting.conversationStarters,
        ).map((starter) => ({
          intent: starter.intent,
          label: starter.label,
          topic: starter.topic,
        })),
        seeds: clipList(layers.prompting.seeds).map((seed) => ({
          angle: clip(seed.angle, 160),
          topic: seed.topic,
        })),
      },
      recentPosts: clipList(layers.recentPosts, 5).map((post) =>
        clip(post, 160),
      ),
      strategy: layers.strategy,
      visualIdentity: layers.visualIdentity,
      voice: layers.voice
        ? {
            ...layers.voice,
            exemplarTexts: clipList(layers.voice.exemplarTexts, 3).map((text) =>
              clip(text, 240),
            ),
            sampleOutput: clip(layers.voice.sampleOutput),
          }
        : undefined,
    };
  }
}

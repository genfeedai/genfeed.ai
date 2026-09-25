import { BrandsService } from '@api/collections/brands/services/brands.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { BRAND_CONTEXT_CHARACTER_BUDGET } from '@api/services/agent-context-assembly/brand-context-budget.util';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import type { ResolvedAgentTurnContext } from '@api/services/agent-orchestrator/interfaces/agent-turn-context.interface';
import {
  buildBudget,
  buildLayerStatus,
  buildSnapshotLayers,
  readBrandAgentConfig,
  toSnapshotMemories,
  toSnapshotSkills,
} from '@api/services/agent-orchestrator/utils/agent-brand-context-snapshot.util';
import type {
  IAgentBrandContextBudget,
  IAgentBrandContextModel,
  IAgentBrandContextSnapshot,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

export interface AgentBrandContextSnapshotParams {
  brandId: string;
  organizationId: string;
  /** Optional preview message; empty assembles a neutral turn. */
  query?: string;
  userId: string;
}

const MAX_PREVIEW_QUERY_LENGTH = 500;

/**
 * Read-only view of what the chat agent is given about a brand. It runs the
 * chat turn's own assembly (`AgentOrchestratorContextService.resolveTurnContext`)
 * for a threadless turn in the requested brand, then renders the result for
 * inspection. Nothing here persists: no thread, message, or credit is written.
 */
@Injectable()
export class AgentBrandContextSnapshotService {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly contextService: AgentOrchestratorContextService,
    private readonly contextAssemblyService: AgentContextAssemblyService,
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
  ) {}

  async buildSnapshot(
    params: AgentBrandContextSnapshotParams,
  ): Promise<IAgentBrandContextSnapshot> {
    const brand = await this.brandsService.findOne({
      id: params.brandId,
      isDeleted: false,
      organizationId: params.organizationId,
    });
    if (!brand) {
      throw new NotFoundException('Brand', params.brandId);
    }

    const query = (params.query ?? '')
      .trim()
      .slice(0, MAX_PREVIEW_QUERY_LENGTH);
    const turn = await this.contextService.resolveTurnContext(
      { brandId: params.brandId, content: query, source: 'agent' },
      { organizationId: params.organizationId, userId: params.userId },
    );

    const now = new Date();
    const systemPrompt = this.contextService.renderSystemPrompt(
      turn.systemPrompt,
      now,
    );
    const memories = toSnapshotMemories(turn.memories, params.userId);
    const visibleMemoryIds = new Set(memories.map((memory) => memory.id));
    const memoryPrompt = this.contextService.buildMemoryPromptSections(
      turn.memories.filter((memory) => visibleMemoryIds.has(memory.id)),
    );
    const layers = buildSnapshotLayers(
      turn.brandContext,
      {
        brandName: brand.label || 'Unknown Brand',
        description: brand.description ?? undefined,
      },
      readBrandAgentConfig(brand.agentConfig),
    );
    const skills = toSnapshotSkills(turn.resolvedSkills);

    return {
      brandId: params.brandId,
      brandName: layers.identity.name,
      budget: this.buildBudget(turn),
      generatedAt: now.toISOString(),
      id: params.brandId,
      layerStatus: buildLayerStatus({
        layers,
        memoryCount: memories.length,
        memoryPrompt,
        skillCount: skills.length,
        systemPrompt,
      }),
      layers,
      layersUsed: turn.brandContext?.layersUsed ?? [],
      memories,
      memoryPrompt,
      model: await this.resolveModel(turn.model),
      query,
      skills,
      systemPrompt,
    };
  }

  private buildBudget(
    turn: ResolvedAgentTurnContext,
  ): IAgentBrandContextBudget {
    if (!turn.brandContext) {
      return buildBudget({
        capChars: BRAND_CONTEXT_CHARACTER_BUDGET,
        trimmedPrompt: '',
        untrimmedPrompt: '',
      });
    }
    // An empty base prompt renders just the brand-context block, so the two
    // renders differ only by the budget the chat turn applies.
    const options = { replyStyle: turn.replyStyle };
    return buildBudget({
      capChars: BRAND_CONTEXT_CHARACTER_BUDGET,
      trimmedPrompt: this.contextAssemblyService.buildSystemPrompt(
        '',
        turn.brandContext,
        options,
      ),
      untrimmedPrompt: this.contextAssemblyService.buildSystemPrompt(
        '',
        turn.brandContext,
        { ...options, maxBrandContextLength: Number.POSITIVE_INFINITY },
      ),
    });
  }

  private async resolveModel(
    resolvedModel: string | undefined,
  ): Promise<IAgentBrandContextModel> {
    const key =
      resolvedModel ?? (await this.agentChatModelRegistry.getDefaultModelKey());
    const [creditsPerRound, selectable] = await Promise.all([
      this.agentChatModelRegistry.getRoundCredits(key),
      this.agentChatModelRegistry.listSelectable(),
    ]);
    const label = selectable.find((row) => row.key === key)?.label;
    return {
      creditsPerRound,
      key,
      ...(label ? { label } : {}),
    };
  }
}

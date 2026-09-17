import { BrandsService } from '@api/collections/brands/services/brands.service';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type {
  AgentToolResult,
  ExternalBrandOption,
  GenerationContextReceipt,
  SelectedGenerationContext,
} from '@genfeedai/contracts/interfaces';
import {
  applyTaskContextToPrompt,
  assertSelectedContextLimits,
  buildGenerationContextReceipt,
  readSelectedGenerationContext,
} from '@genfeedai/helpers/generation-context.helper';
import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class AgentGenerationScopeService {
  constructor(
    private readonly brandsService: BrandsService,
    @Optional()
    private readonly knowledgeRecords?: KnowledgeRecordsService,
  ) {}

  async resolveBrand(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<{ brandId: string } | { error: AgentToolResult }> {
    const explicitId = this.readId(params.brandId);
    if (explicitId) {
      const brand = await this.brandsService.findOne({
        id: explicitId,
        isDeleted: false,
        organizationId: ctx.organizationId,
      });
      if (!brand?.id) {
        return {
          error: {
            creditsUsed: 0,
            error: 'Brand was not found in this organization.',
            success: false,
          },
        };
      }
      return { brandId: String(brand.id) };
    }

    if (ctx.brandId) {
      const contextBrand = await this.brandsService.findOne({
        id: ctx.brandId,
        isDeleted: false,
        organizationId: ctx.organizationId,
      });
      if (contextBrand?.id) {
        return { brandId: String(contextBrand.id) };
      }
    }

    const selectedBrand = await this.brandsService.findOne({
      isDeleted: false,
      isSelected: true,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
    if (selectedBrand?.id) {
      return { brandId: String(selectedBrand.id) };
    }

    const brands = await this.listOrganizationBrands(ctx.organizationId);
    if (brands.length === 1 && brands[0]) {
      return { brandId: brands[0].id };
    }
    if (brands.length === 0) {
      return {
        error: {
          creditsUsed: 0,
          error: 'Create a brand before generating organization media.',
          success: false,
        },
      };
    }

    return {
      error: {
        creditsUsed: 0,
        data: { brands, recoveryAction: 'select_brand' },
        error:
          'Select a brand before generating. Pass brandId from list_brands; the first organization brand is not used automatically.',
        success: false,
      },
    };
  }

  async applySelectedContext(input: {
    ctx: ToolExecutionContext;
    params: Record<string, unknown>;
    prompt: string;
  }): Promise<
    | {
        prompt: string;
        receipt: GenerationContextReceipt;
      }
    | { error: AgentToolResult }
  > {
    const selected = readSelectedGenerationContext(
      input.params.selectedContext,
    );
    const brandId = input.ctx.brandId;
    if (!brandId) {
      return {
        error: {
          creditsUsed: 0,
          error: 'Select a brand before applying generation context.',
          success: false,
        },
      };
    }

    if (!selected) {
      return {
        prompt: input.prompt,
        receipt: buildGenerationContextReceipt({ brandId }),
      };
    }

    const limitError = assertSelectedContextLimits(selected);
    if (limitError) {
      return {
        error: { creditsUsed: 0, error: limitError, success: false },
      };
    }

    if (selected.sourceIds && selected.sourceIds.length > 0) {
      const unauthorized = await this.rejectUnauthorizedSources(
        selected,
        input.ctx,
        brandId,
      );
      if (unauthorized) {
        return unauthorized;
      }
    }

    return {
      prompt: applyTaskContextToPrompt(input.prompt, selected),
      receipt: buildGenerationContextReceipt({
        brandId,
        sourceIds: selected.sourceIds,
        text: selected.text,
      }),
    };
  }

  private async rejectUnauthorizedSources(
    selected: SelectedGenerationContext,
    ctx: ToolExecutionContext,
    brandId: string,
  ): Promise<{ error: AgentToolResult } | undefined> {
    if (!this.knowledgeRecords || !selected.sourceIds) {
      return {
        error: {
          creditsUsed: 0,
          error: 'Knowledge sources cannot be resolved in this environment.',
          success: false,
        },
      };
    }

    for (const sourceId of selected.sourceIds) {
      try {
        await this.knowledgeRecords.getSource(
          {
            brandId,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
          },
          sourceId,
        );
      } catch {
        return {
          error: {
            creditsUsed: 0,
            error: `Knowledge source ${sourceId} is not available in this organization.`,
            success: false,
          },
        };
      }
    }
    return undefined;
  }

  private async listOrganizationBrands(
    organizationId: string,
  ): Promise<ExternalBrandOption[]> {
    const page = await this.brandsService.findAll(
      { where: { isDeleted: false, organizationId } },
      { limit: 50, page: 1 },
      false,
    );
    return page.docs.flatMap((brand) => {
      const id = typeof brand.id === 'string' ? brand.id : undefined;
      if (!id) {
        return [];
      }
      const label =
        typeof brand.label === 'string' && brand.label.trim().length > 0
          ? brand.label
          : id;
      return [{ id, label }];
    });
  }

  private readId(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }
}

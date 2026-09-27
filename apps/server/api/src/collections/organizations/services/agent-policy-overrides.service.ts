import { ModelsService } from '@api/collections/models/services/models.service';
import { isModelOnAllowlist } from '@api/collections/models/utils/enabled-model.util';
import type { UpdateOrganizationSettingDto } from '@api/collections/organization-settings/dto/update-organization-setting.dto';
import type { OrganizationSettingDocument } from '@api/collections/organization-settings/schemas/organization-setting.schema';
import { ModelCategory } from '@genfeedai/contracts';
import {
  AGENT_GENERATION_OVERRIDE_CATEGORIES,
  AGENT_REVIEW_OVERRIDE_CATEGORIES,
  AGENT_THINKING_OVERRIDE_CATEGORIES,
} from '@genfeedai/contracts/constants';
import { BadRequestException, Injectable } from '@nestjs/common';

type AgentPolicyModelOverrideField =
  | 'generationModelOverride'
  | 'reviewModelOverride'
  | 'thinkingModelOverride';

/**
 * Normalizes and validates the agent-policy model-override fields on an
 * organization settings patch — extracted from
 * `OrganizationsSettingsController` (#5317) to keep the controller focused on
 * request handling.
 */
@Injectable()
export class AgentPolicyOverridesService {
  constructor(private readonly modelsService: ModelsService) {}

  /**
   * Trims an agent-policy override to comparable, storable form. Empty after
   * trim clears the override (persisted as `null`) rather than storing stray
   * whitespace, matching the `value?.trim() || null` convention used
   * elsewhere in this collection for optional string fields. `undefined` is
   * left alone — the field was not part of this patch at all.
   */
  private normalizeOverrideValue(
    value: string | null | undefined,
  ): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    return value?.trim() || null;
  }

  /**
   * Normalizes the three model-override fields on an incoming agentPolicy
   * patch before they are compared against the stored value or persisted.
   * Without this, a value that only differs in surrounding whitespace from
   * the stored override defeats the preserve rule in {@link validateOverrides}
   * below, and untrimmed whitespace would otherwise be written to the
   * database.
   */
  normalizeOverrides(
    settingsDto: UpdateOrganizationSettingDto,
  ): UpdateOrganizationSettingDto {
    const overrides = settingsDto.agentPolicy;
    if (!overrides) {
      return settingsDto;
    }

    return {
      ...settingsDto,
      agentPolicy: {
        ...overrides,
        generationModelOverride: this.normalizeOverrideValue(
          overrides.generationModelOverride,
        ),
        reviewModelOverride: this.normalizeOverrideValue(
          overrides.reviewModelOverride,
        ),
        thinkingModelOverride: this.normalizeOverrideValue(
          overrides.thinkingModelOverride,
        ),
      },
    };
  }

  /**
   * Rejects a model override key the settings page's own picker could never
   * have shown — the frontend resolves each override against its selector's
   * enabled, category-scoped catalog before persisting (see
   * resolveEnabledModelsForCategory / resolveOverrideForSave), but the API
   * must not trust that a client did so. An override left unchanged from the
   * stored value is exempt: the frontend's own preserve rule can legitimately
   * resend a value that no longer resolves (a model removed from the
   * allowlist after it was saved) rather than silently drop it, and that is
   * not a new invalid input for this save to reject.
   *
   * Callers must pass `settingsDto` through {@link normalizeOverrides} first —
   * both sides of the preserve comparison below assume the incoming override
   * is already trimmed, so an unrelated save can't be rejected by a
   * whitespace difference against the untrimmed stored value.
   */
  async validateOverrides(
    organizationSetting: OrganizationSettingDocument,
    settingsDto: UpdateOrganizationSettingDto,
  ): Promise<void> {
    const overrides = settingsDto.agentPolicy;
    if (!overrides) {
      return;
    }

    const enabledModelIds = Array.isArray(settingsDto.enabledModelIds)
      ? settingsDto.enabledModelIds
      : (organizationSetting.enabledModelIds ?? []);

    const checks: Array<{
      categories: readonly ModelCategory[];
      field: AgentPolicyModelOverrideField;
    }> = [
      {
        categories: AGENT_GENERATION_OVERRIDE_CATEGORIES,
        field: 'generationModelOverride',
      },
      {
        categories: AGENT_REVIEW_OVERRIDE_CATEGORIES,
        field: 'reviewModelOverride',
      },
      {
        categories: AGENT_THINKING_OVERRIDE_CATEGORIES,
        field: 'thinkingModelOverride',
      },
    ];

    const pendingChecks = checks.filter(({ field }) => {
      const value = overrides[field];
      if (!value) {
        return false;
      }
      const storedValue = organizationSetting.agentPolicy?.[field]?.trim();
      // Preserve rule: an unrelated save can resend the exact stored value
      // (whitespace differences included) even if it would no longer
      // validate — that is not a new input.
      return value !== storedValue;
    });

    if (pendingChecks.length === 0) {
      return;
    }

    const availableModels = await this.modelsService.findAvailableModels({
      organizationId: organizationSetting.organizationId,
    });

    for (const { categories, field } of pendingChecks) {
      const value = overrides[field] as string;
      const categorySet = new Set<string>(categories);
      const enabledInCategory = availableModels.filter(
        (model) =>
          categorySet.has(model.category) &&
          isModelOnAllowlist(model, enabledModelIds),
      );
      const isValid = enabledInCategory.some(
        (model) => model.id === value || model.key === value,
      );

      if (!isValid) {
        throw new BadRequestException(
          `${field} "${value}" is not an enabled model for its category`,
        );
      }
    }
  }
}

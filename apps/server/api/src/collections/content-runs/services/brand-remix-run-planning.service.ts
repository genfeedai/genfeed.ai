import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { resolveEffectiveBrandAgentConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { toBrandGenerationReferences } from '@api/collections/brands/utils/brand-kit-generation-references.util';
import {
  remixOrganicPlatform,
  remixRecord,
  remixText,
} from '@api/collections/content-runs/services/brand-remix-run-helpers';
import {
  type BrandRemixReferenceEdit,
  GENERATION_READY_STATUSES,
  type ResolvedBrandContext,
  type ResolvedSource,
  SUPPORTED_ASPECT_RATIOS,
} from '@api/collections/content-runs/services/brand-remix-runs.types';
import { BrandRemixSourceResolverService } from '@api/collections/content-runs/services/brand-remix-source-resolver.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { isMaterializableSavedVoice } from '@api/collections/videos/services/saved-voice-materialization';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AssetCategory,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import {
  type BrandRemixDraft,
  type BrandRemixDraftEdits,
  type BrandRemixReadiness,
  type BrandRemixRunConfig,
  type BrandRemixSourceSelector,
  brandRemixDraftSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import type { GenerationBrief } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { generationBriefSchema } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type { IBrandKitResolvedAssets } from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class BrandRemixRunPlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly sourceResolver: BrandRemixSourceResolverService,
  ) {}

  resolveSource(
    organizationId: string,
    brandId: string,
    selector: BrandRemixSourceSelector,
  ): Promise<ResolvedSource> {
    return this.sourceResolver.resolveSource(organizationId, brandId, selector);
  }

  assertConnectedCredential(
    organizationId: string,
    brandId: string,
    credentialId: string,
    platform: 'google' | 'meta' | 'tiktok' | 'x',
  ) {
    return this.sourceResolver.assertConnectedCredential(
      organizationId,
      brandId,
      credentialId,
      platform,
    );
  }

  async resolveBrandContext(
    organizationId: string,
    brandId: string,
  ): Promise<ResolvedBrandContext> {
    const brand = await this.brandsService.findOne(
      scopedWhere(organizationId, { id: brandId, isActive: true }),
      'none',
    );
    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }
    const [organizationSettings, brandKit] = await Promise.all([
      this.organizationSettingsService.findOne({
        organizationId,
      }),
      this.brandsService.resolveBrandKitAssets(brandId, organizationId),
    ]);
    const effective = resolveEffectiveBrandAgentConfig({
      brand,
      organizationSettings,
    });
    const identity = effective.identityDefaults.effective;
    const defaultIdentity: BrandRemixDraft['identity'] =
      identity.defaultAvatarIngredientId && identity.defaultVoiceId
        ? {
            avatarAssetId: identity.defaultAvatarIngredientId,
            speechVoiceId: identity.defaultVoiceId,
          }
        : {};
    const contextMode = this.hasBrandContext(brand, brandKit)
      ? 'brand'
      : 'organization_defaults';

    return {
      brand,
      brandKit,
      contextMode,
      defaultIdentity,
    };
  }

  defaultDraft(
    context: ResolvedBrandContext,
    source: ResolvedSource,
  ): BrandRemixDraft {
    const isPaidSource =
      source.snapshot.selector.kind === 'connected_ad' ||
      source.snapshot.selector.kind === 'public_ad' ||
      source.snapshot.selector.kind === 'saved_ad';
    const target = isPaidSource
      ? ({ kind: 'paid', platform: source.snapshot.platform } as const)
      : ({
          kind: 'organic',
          platform: remixOrganicPlatform(source.snapshot.platform),
        } as const);
    const aspectRatio =
      source.snapshot.platform === 'youtube'
        ? '16:9'
        : target.kind === 'paid'
          ? '1:1'
          : '9:16';
    const outputKind =
      source.recommendedOutputKind === 'video' &&
      aspectRatio === '9:16' &&
      'avatarAssetId' in context.defaultIdentity
        ? 'avatar'
        : source.recommendedOutputKind;
    const hookPattern =
      source.snapshot.pattern.hook?.replace(/[.!?]+$/, '') ??
      'performance-led hook';
    const defaultReferences = this.mergeDefaultReferences([], context.brandKit);
    const objective =
      outputKind === 'avatar'
        ? this.defaultAvatarSpeech(context)
        : `Create an original ${source.snapshot.platform} execution for ${context.brand.label} using an evidence-backed ${hookPattern} and wholly original brand expression.`;
    return brandRemixDraftSchema.parse({
      fidelityMode: 'guided',
      identity: context.defaultIdentity,
      intent: {
        callToAction: source.snapshot.pattern.callToAction,
        hook: source.snapshot.pattern.hook,
        objective,
        offer: source.snapshot.pattern.offer,
        pacing: source.snapshot.pattern.pacing,
        structure: source.snapshot.pattern.structure,
        visualDirection: source.snapshot.pattern.visualDirection,
      },
      output: {
        aspectRatio,
        count: 3,
        kind: outputKind,
        ...(outputKind === 'video' ? { durationSeconds: 8 } : {}),
      },
      references: defaultReferences,
      reviewRequired: true,
      target,
    });
  }

  async resolveDraft(
    organizationId: string,
    brandId: string,
    context: ResolvedBrandContext,
    current: BrandRemixDraft,
    edits?: BrandRemixDraftEdits,
  ): Promise<BrandRemixDraft> {
    if (!edits) {
      await this.assertDraftAssetsAuthorized(organizationId, brandId, current);
      return current;
    }
    const references = edits.references
      ? this.mergeDefaultReferences(edits.references, context.brandKit)
      : current.references;
    const output = this.mergeOutput(current.output, edits.output);
    const intent = { ...current.intent, ...(edits.intent ?? {}) };
    if (
      current.output.kind !== 'avatar' &&
      output.kind === 'avatar' &&
      (!edits.intent?.objective ||
        edits.intent.objective.trim() === current.intent.objective.trim())
    ) {
      intent.objective = this.defaultAvatarSpeech(context);
    }
    const draft = brandRemixDraftSchema.parse({
      ...current,
      ...(edits.fidelityMode ? { fidelityMode: edits.fidelityMode } : {}),
      ...(edits.identity
        ? {
            identity:
              'avatarAssetId' in edits.identity &&
              edits.identity.avatarAssetId === null
                ? {}
                : edits.identity,
          }
        : {}),
      intent,
      output,
      references,
      ...(edits.target ? { target: edits.target } : {}),
    });
    await this.assertDraftAssetsAuthorized(organizationId, brandId, draft);
    return draft;
  }

  buildReadiness(
    context: ResolvedBrandContext,
    draft: BrandRemixDraft,
  ): BrandRemixReadiness {
    const issues: BrandRemixReadiness['issues'] = [];
    const hasStrictFidelityReference = draft.references.some((reference) =>
      ['subject', 'character', 'product', 'first_frame', 'last_frame'].includes(
        reference.role,
      ),
    );
    if (draft.fidelityMode === 'strict' && !hasStrictFidelityReference) {
      issues.push({
        code: 'missing_required_reference',
        field: 'references',
        message:
          'Strict fidelity requires at least one identity, product, or frame reference.',
        severity: 'blocked',
      });
    }
    if (context.contextMode === 'organization_defaults') {
      issues.push({
        code: 'organization_defaults',
        field: 'intent',
        message:
          'This brand has limited creative context, so organization defaults will fill the recipe.',
        severity: 'degraded',
      });
    }
    if (
      'aspectRatio' in draft.output &&
      !SUPPORTED_ASPECT_RATIOS.has(draft.output.aspectRatio)
    ) {
      issues.push({
        code: 'unsupported_aspect_ratio',
        field: 'output',
        message: `Aspect ratio ${draft.output.aspectRatio} is not supported by the remix generation path.`,
        severity: 'blocked',
      });
    }
    this.appendDurationAndIdentityIssues(draft, issues);
    if (
      draft.output.kind === 'image' &&
      draft.references.some(
        (reference) =>
          reference.role === 'first_frame' || reference.role === 'last_frame',
      )
    ) {
      issues.push({
        code: 'unsupported_reference_role',
        field: 'references',
        message: 'First-frame and last-frame references require video output.',
        severity: draft.fidelityMode === 'guided' ? 'degraded' : 'blocked',
      });
    }

    return {
      issues,
      state: issues.some((issue) => issue.severity === 'blocked')
        ? 'blocked'
        : issues.length
          ? 'degraded'
          : 'ready',
    };
  }

  async assertDraftAssetsAuthorized(
    organizationId: string,
    brandId: string,
    draft: BrandRemixDraft,
  ): Promise<void> {
    const referenceIds = [
      ...new Set(draft.references.map((reference) => reference.assetId)),
    ];
    const identityIds =
      'avatarAssetId' in draft.identity
        ? [draft.identity.avatarAssetId, draft.identity.speechVoiceId]
        : [];
    const ingredientIds = [...new Set([...referenceIds, ...identityIds])];
    const [ingredients, assets] = await Promise.all([
      ingredientIds.length
        ? this.prisma.ingredient.findMany({
            select: {
              brandId: true,
              category: true,
              externalVoiceId: true,
              id: true,
              isCloned: true,
              sampleAudioUrl: true,
              status: true,
              voiceProvider: true,
            },
            where: scopedWhere(organizationId, {
              id: { in: ingredientIds },
              OR: [{ brandId }, { brandId: null }],
              status: {
                in: [...GENERATION_READY_STATUSES] as IngredientStatus[],
              },
            }),
          })
        : Promise.resolve([]),
      referenceIds.length
        ? this.prisma.asset.findMany({
            select: { id: true },
            where: {
              category: AssetCategory.REFERENCE,
              id: { in: referenceIds },
              isDeleted: false,
              OR: [
                { parentBrandId: brandId, parentOrgId: organizationId },
                { parentBrandId: null, parentOrgId: organizationId },
              ],
            },
          })
        : Promise.resolve([]),
    ]);
    const ingredientById = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );
    const authorizedIds = new Set([
      ...ingredients.map((ingredient) => ingredient.id),
      ...assets.map((asset) => asset.id),
    ]);
    const missingReferences = referenceIds.filter(
      (referenceId) => !authorizedIds.has(referenceId),
    );
    if (missingReferences.length) {
      throw new BadRequestException({
        detail:
          'One or more remix references are unavailable to this brand or are not generation-ready.',
        title: 'Invalid remix references',
      });
    }
    this.assertAvatarIdentity(draft, ingredientById);
  }

  async assertGeneratedAssetsAuthorized(
    organizationId: string,
    brandId: string,
    ingredientIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(ingredientIds)];
    const ingredients = await this.prisma.ingredient.findMany({
      select: { id: true },
      where: scopedWhere(organizationId, {
        brandId,
        id: { in: uniqueIds },
        status: { in: [...GENERATION_READY_STATUSES] as IngredientStatus[] },
      }),
    });
    if (ingredients.length !== uniqueIds.length) {
      throw new BadRequestException({
        detail:
          'One or more generated assets are unavailable, not ready, or belong to another brand.',
        title: 'Invalid generated remix assets',
      });
    }
  }

  buildGenerationBrief(
    context: ResolvedBrandContext,
    config: BrandRemixRunConfig,
  ): GenerationBrief {
    const draft = config.draft;
    const references =
      draft.output.kind === 'image' && draft.fidelityMode === 'guided'
        ? draft.references.filter(
            (reference) =>
              reference.role !== 'first_frame' &&
              reference.role !== 'last_frame',
          )
        : draft.references;
    const common = {
      constraints: [
        ...(draft.intent.offer
          ? [
              {
                kind: 'desired_outcome' as const,
                required: false,
                value: `Communicate the offer: ${draft.intent.offer}`,
              },
            ]
          : []),
        {
          kind: 'avoid' as const,
          required: true,
          value:
            'Do not copy, closely paraphrase, quote, or identify the source creative.',
        },
      ],
      fidelityMode: draft.fidelityMode,
      provenance: [
        { field: 'intent.objective', source: 'user' as const },
        { field: 'intent.subjects', source: 'brand' as const },
        { field: 'intent.visualDirection', source: 'performance' as const },
        ...references.map((reference) => ({
          field: `references.${reference.assetId}`,
          source: 'reference' as const,
        })),
      ],
      references: references.map(({ assetId, description, role }) => ({
        assetId,
        ...(description ? { description } : {}),
        role,
      })),
      version: 1 as const,
    };
    const intent = {
      composition: draft.intent.structure,
      objective: draft.intent.objective,
      requestedText: [draft.intent.callToAction, draft.intent.offer].filter(
        (value): value is string => Boolean(value),
      ),
      subjects: [context.brand.label],
      visualDirection: draft.intent.visualDirection,
    };
    if (draft.output.kind === 'copy') {
      return generationBriefSchema.parse({
        ...common,
        intent,
        mediaKind: 'text',
        output: {},
      });
    }
    const output = {
      aspectRatio: draft.output.aspectRatio,
      ...('durationSeconds' in draft.output &&
      draft.output.durationSeconds !== undefined
        ? { durationSeconds: draft.output.durationSeconds }
        : {}),
    };
    if (draft.output.kind === 'image') {
      return generationBriefSchema.parse({
        ...common,
        intent,
        mediaKind: 'image',
        output,
      });
    }
    return generationBriefSchema.parse({
      ...common,
      intent: {
        ...intent,
        audioDirection:
          draft.output.kind === 'avatar'
            ? 'Use the selected saved brand voice.'
            : undefined,
        cinematography: draft.intent.visualDirection,
        motion: draft.intent.pacing,
      },
      mediaKind: 'video',
      output,
    });
  }

  defaultAvatarSpeech(context: ResolvedBrandContext): string {
    const brandName = context.brand.label.trim();
    return `Meet ${brandName}. Put the outcome first, make the next step clear, and discover what ${brandName} can do for you.`;
  }

  private mergeOutput(
    current: BrandRemixDraft['output'],
    patch: BrandRemixDraftEdits['output'],
  ): BrandRemixDraft['output'] {
    if (!patch) return current;
    const kind = patch.kind ?? current.kind;
    const duration =
      patch.durationSeconds === null
        ? undefined
        : (patch.durationSeconds ??
          ('durationSeconds' in current ? current.durationSeconds : undefined));
    if (kind === 'copy') {
      return { count: patch.count ?? current.count, kind };
    }
    const currentAspectRatio =
      'aspectRatio' in current ? current.aspectRatio : '9:16';
    const base = {
      aspectRatio: patch.aspectRatio ?? currentAspectRatio,
      count: patch.count ?? current.count,
    };
    if (kind === 'image') return { ...base, kind };
    return {
      ...base,
      ...(duration !== undefined ? { durationSeconds: duration } : {}),
      kind,
    };
  }

  private mergeDefaultReferences(
    explicit: BrandRemixReferenceEdit[],
    brandKit: IBrandKitResolvedAssets,
  ): BrandRemixDraft['references'] {
    const explicitReferences = explicit.map((reference) => ({
      ...reference,
      source: 'explicit' as const,
    }));
    const explicitRoles = new Set(
      explicitReferences.map((reference) => reference.role),
    );
    const explicitAssetIds = new Set(
      explicitReferences.map((reference) => reference.assetId),
    );
    const defaults = toBrandGenerationReferences(brandKit)
      .map((reference) => ({
        ...reference,
        source: 'brand_default' as const,
      }))
      .filter(
        (reference) =>
          !explicitRoles.has(reference.role) &&
          !explicitAssetIds.has(reference.assetId),
      )
      .slice(0, 3);
    return [...explicitReferences, ...defaults];
  }

  private appendDurationAndIdentityIssues(
    draft: BrandRemixDraft,
    issues: BrandRemixReadiness['issues'],
  ): void {
    if (
      draft.output.kind === 'video' &&
      'durationSeconds' in draft.output &&
      draft.output.durationSeconds !== undefined &&
      (draft.output.durationSeconds < 4 || draft.output.durationSeconds > 60)
    ) {
      issues.push({
        code: 'unsupported_duration',
        field: 'output',
        message: 'Generated video duration must be between 4 and 60 seconds.',
        severity: 'blocked',
      });
    }
    if (
      draft.output.kind === 'avatar' &&
      'durationSeconds' in draft.output &&
      draft.output.durationSeconds !== undefined
    ) {
      issues.push({
        code: 'unsupported_duration',
        field: 'output',
        message:
          'Avatar duration is determined by speech and cannot be fixed in advance.',
        severity: 'degraded',
      });
    }
    if (draft.output.kind !== 'avatar') return;
    if (!('avatarAssetId' in draft.identity)) {
      issues.push({
        code: 'missing_avatar',
        field: 'avatarAssetId',
        message: 'Choose a brand avatar before generating an avatar remix.',
        severity: 'blocked',
      });
    }
    if (!('speechVoiceId' in draft.identity)) {
      issues.push({
        code: 'missing_voice',
        field: 'speechVoiceId',
        message:
          'Choose a saved brand voice before generating an avatar remix.',
        severity: 'blocked',
      });
    }
  }

  private assertAvatarIdentity(
    draft: BrandRemixDraft,
    ingredientById: Map<
      string,
      {
        category: IngredientCategory | string;
        externalVoiceId: string | null;
        sampleAudioUrl: string | null;
        voiceProvider: string | null;
      }
    >,
  ): void {
    if (!('avatarAssetId' in draft.identity)) return;
    const avatar = ingredientById.get(draft.identity.avatarAssetId);
    const voice = ingredientById.get(draft.identity.speechVoiceId);
    if (avatar?.category !== IngredientCategory.AVATAR) {
      throw new BadRequestException({
        detail: 'The selected avatar must be a generation-ready brand avatar.',
        title: 'Invalid remix avatar',
      });
    }
    if (
      voice?.category !== IngredientCategory.VOICE ||
      !isMaterializableSavedVoice({
        externalVoiceId: voice.externalVoiceId,
        provider: voice.voiceProvider,
        sampleAudioUrl: voice.sampleAudioUrl,
      })
    ) {
      throw new BadRequestException({
        detail: 'The selected voice must be a usable saved brand voice.',
        title: 'Invalid remix voice',
      });
    }
  }

  private hasBrandContext(
    brand: BrandDocument,
    brandKit: IBrandKitResolvedAssets,
  ): boolean {
    return Boolean(
      remixText(brand.description) ||
        remixText(brand.text) ||
        Object.keys(remixRecord(brand.agentConfig)).length ||
        brandKit.references.length,
    );
  }
}

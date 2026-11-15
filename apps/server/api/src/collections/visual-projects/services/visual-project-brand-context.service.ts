import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type { BrandedGenerationActorV1 } from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import { BrandedModeResolverService } from '@api/services/branded-text-generation/branded-mode-resolver.service';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import { formatHarnessBrief } from '@api/services/harness/harness-brief.util';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { SkillRuntimeService } from '@api/services/skill-runtime/skill-runtime.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  brandGenerationLayerReceiptV1Schema,
  brandIdentitySnapshotV1Schema,
} from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationResolutionV1,
  BrandGenerationLayerReceiptV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces';
import type { ResolvedRuntimeSkill } from '@genfeedai/contracts/interfaces/ai';
import type { VisualRevision } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  type IVisualBrandContext,
  projectVisualBrandContext,
} from '../utils/visual-brand-context.util';

const pinnedReceiptSchema = z.object({
  mode: z.enum(['approved_brand', 'provisional_brand']),
  snapshot: brandIdentitySnapshotV1Schema,
});
const PROMPT_BYTE_LIMIT = 65_536;
const RECEIPT_PROVIDER = 'visual-code';

function encode(value: unknown): string {
  return JSON.stringify(value);
}

function sliceBytes(text: string, limit: number): string {
  const bytes = Buffer.from(text);
  return bytes.byteLength <= limit
    ? text
    : bytes.subarray(0, limit).toString('utf8');
}

/**
 * Resolves the brand a Motion composition is authored against, through the
 * same seam as image and video generation: the approved Brand OS revision (or
 * the brand's draft, provisionally), the media harness brief and the video
 * skills. The first authoring call for a revision writes a branded receipt
 * that pins the snapshot, so a repair of the same revision reads the same
 * brand even when the owner approves a new one in between.
 */
@Traced()
@Injectable()
export class VisualProjectBrandContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modes: BrandedModeResolverService,
    private readonly snapshots: BrandIdentitySnapshotService,
    private readonly receipts: BrandedGenerationReceiptsService,
    private readonly harness: HarnessGenerationService,
    private readonly contentHarness: ContentHarnessService,
    private readonly skillRuntime: SkillRuntimeService,
    private readonly logger: LoggerService,
  ) {}

  async resolve(
    revision: VisualRevision,
    stagedAssetIds: readonly string[],
  ): Promise<IVisualBrandContext> {
    const actor: BrandedGenerationActorV1 = {
      organizationId: revision.organizationId,
      brandId: revision.brandId,
      actorId: revision.userId,
    };
    const pinned = await this.pinnedSnapshot(revision);
    const { mode, snapshot } = pinned ?? (await this.captureSnapshot(revision));
    const [brief, skills] = await Promise.all([
      this.resolveBrief(revision, snapshot),
      this.resolveSkills(revision),
    ]);
    const packs = brief
      ? (await this.contentHarness.listLoadedPackVersions()).filter((pack) =>
          brief.appliedPacks.includes(pack.id),
        )
      : [];
    const context = projectVisualBrandContext({
      snapshot,
      stagedAssetIds,
      harnessBrief: formatHarnessBrief(brief),
      skills: skills.text,
    });
    if (!pinned)
      await this.writeReceipt(revision, actor, {
        mode,
        snapshot,
        context,
        layers: [...this.packLayers(brief !== null, packs), ...skills.layers],
      });
    return context;
  }

  private async pinnedSnapshot(revision: VisualRevision) {
    const row = await this.prisma.brandedGenerationReceipt.findFirst({
      where: {
        organizationId: revision.organizationId,
        brandId: revision.brandId,
        requestKey: revision.id,
        candidateIndex: 0,
        isDeleted: false,
      },
      select: { projection: true },
    });
    const parsed = pinnedReceiptSchema.safeParse(row?.projection);
    if (
      !parsed.success ||
      parsed.data.snapshot.organizationId !== revision.organizationId ||
      parsed.data.snapshot.brandId !== revision.brandId
    )
      return null;
    return parsed.data;
  }

  private async captureSnapshot(revision: VisualRevision): Promise<{
    mode: 'approved_brand' | 'provisional_brand';
    snapshot: BrandIdentitySnapshotV1;
  }> {
    const resolution = await this.modes.resolve(
      { userId: revision.userId, organizationId: revision.organizationId },
      revision.brandId,
    );
    const actor: BrandedGenerationActorV1 = {
      organizationId: revision.organizationId,
      brandId: revision.brandId,
      actorId: revision.userId,
    };
    const snapshot =
      resolution.mode === 'approved_brand'
        ? await this.snapshots.preview(actor)
        : await this.snapshots.previewProvisional(
            actor,
            resolution.draftRevisionId,
          );
    return { mode: resolution.mode, snapshot };
  }

  /** The brief is optional context: an unavailable harness never blocks authoring. */
  private async resolveBrief(
    revision: VisualRevision,
    snapshot: BrandIdentitySnapshotV1,
  ) {
    try {
      return await this.harness.resolveBrief({
        userId: revision.userId,
        organizationId: revision.organizationId,
        brandId: revision.brandId,
        brandRevisionId: snapshot.revisionId,
        contentType: 'video',
        topic: revision.prompt ?? undefined,
        includeContentMemory: true,
        surface: 'media',
      });
    } catch (error: unknown) {
      this.logger.warn('Motion harness brief unavailable', {
        errorName: error instanceof Error ? error.constructor.name : 'NonError',
        revisionId: revision.id,
      });
      return null;
    }
  }

  private async resolveSkills(revision: VisualRevision): Promise<{
    text: string;
    layers: BrandGenerationLayerReceiptV1[];
  }> {
    try {
      const resolved: ResolvedRuntimeSkill[] =
        await this.skillRuntime.resolveActiveSkills(
          revision.organizationId,
          revision.brandId,
          undefined,
          { actorUserId: revision.userId, modality: 'video' },
        );
      const usable = resolved.filter(
        (skill) =>
          skill.instructions?.trim() && skill.versionId && skill.contentHash,
      );
      return {
        text: this.skillRuntime.buildSkillPromptSections(usable),
        layers: usable.map((skill) =>
          brandGenerationLayerReceiptV1Schema.parse({
            kind: 'skill',
            id: skill.versionId,
            contentHash: skill.contentHash,
            status: 'applied',
            evidenceIds: [],
            omittedIds: [],
          }),
        ),
      };
    } catch (error: unknown) {
      this.logger.warn('Motion video skills unavailable', {
        errorName: error instanceof Error ? error.constructor.name : 'NonError',
        revisionId: revision.id,
      });
      return {
        text: '',
        layers: [
          brandGenerationLayerReceiptV1Schema.parse({
            kind: 'skill',
            status: 'unavailable',
            reasonCode: 'skill_context_unavailable',
            evidenceIds: [],
            omittedIds: [],
          }),
        ],
      };
    }
  }

  private packLayers(
    isBriefAvailable: boolean,
    packs: Array<{ id: string; version: string }>,
  ): BrandGenerationLayerReceiptV1[] {
    if (!isBriefAvailable)
      return [
        brandGenerationLayerReceiptV1Schema.parse({
          kind: 'pack',
          status: 'unavailable',
          reasonCode: 'pack_context_unavailable',
          evidenceIds: [],
          omittedIds: [],
        }),
      ];
    return packs.map((pack) =>
      brandGenerationLayerReceiptV1Schema.parse({
        kind: 'pack',
        id: pack.id,
        version: pack.version,
        status: 'applied',
        evidenceIds: [],
        omittedIds: [],
      }),
    );
  }

  private async writeReceipt(
    revision: VisualRevision,
    actor: BrandedGenerationActorV1,
    input: {
      mode: 'approved_brand' | 'provisional_brand';
      snapshot: BrandIdentitySnapshotV1;
      context: IVisualBrandContext;
      layers: BrandGenerationLayerReceiptV1[];
    },
  ) {
    const { mode, snapshot } = input;
    const originalPrompt = revision.prompt ?? '';
    const request: BrandedGenerationInputV1 = {
      schemaVersion: 1,
      actorId: actor.actorId,
      organizationId: actor.organizationId,
      brandId: actor.brandId,
      requestKey: revision.id,
      candidateIndex: 0,
      surface: 'workflow',
      contentType: 'video',
      format: 'video',
      mode,
      ...(mode === 'provisional_brand'
        ? { draftRevisionId: snapshot.revisionId }
        : {}),
      originalPrompt,
      provider: RECEIPT_PROVIDER,
      model: revision.modelKey ?? 'unset',
      generationParameters: {
        rendererVersion: revision.rendererVersion,
        source: 'motion',
      },
      knowledgeSourceIds: [],
      knowledgeSpaceIds: [],
    };
    const { receipt } = await this.receipts.create(request, actor);
    if (receipt.state !== 'created') return;
    // Skills and the harness brief are named by layer, not copied into the receipt.
    const compiledPrompt = sliceBytes(
      encode({
        ...input.context,
        harnessBrief: undefined,
        skills: undefined,
      }),
      PROMPT_BYTE_LIMIT,
    );
    const resolution: BrandedGenerationResolutionV1 = {
      schemaVersion: 1,
      mode,
      status: 'resolved',
      compiledPrompt,
      originalPromptHash: hashBrandedGenerationTextV1(originalPrompt),
      snapshot,
      layers: [
        brandGenerationLayerReceiptV1Schema.parse({
          kind: 'identity',
          id: snapshot.revisionId,
          contentHash: snapshot.contentHash,
          status: 'applied',
          evidenceIds: [],
          omittedIds: [],
        }),
        ...input.layers,
      ],
      diagnostics: [],
      learning: {
        schemaVersion: 1,
        brandFeedback: { status: 'not_applicable', sourceIds: [] },
        global: {
          status: 'not_applicable',
          scope: { format: 'video', objective: 'engagement' },
        },
        privateAccount: {
          mode: 'no_destination',
          configVersion: 'media-raw-v1',
          synthetic: false,
          application: {
            status: 'unavailable',
            reasonCodes: ['no_destination'],
            privatePolicyApplied: false,
            sharedReleaseApplied: false,
            revalidatedAt: new Date().toISOString(),
          },
        },
      },
    };
    await this.receipts.recordResolution(
      actor,
      receipt.id,
      {
        operationKey: `${receipt.id}:resolve`,
        expectedRevision: receipt.revision,
      },
      resolution,
    );
  }
}

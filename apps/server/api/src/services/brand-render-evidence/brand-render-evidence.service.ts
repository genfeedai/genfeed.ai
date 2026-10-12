import {
  type BuildBrandRenderEvidenceInput,
  buildBrandRenderEvidenceManifest,
  verifyBrandRenderEvidenceManifest,
} from '@api/services/brand-render-evidence/brand-render-evidence-manifest.util';
import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IVisualSandboxMedia } from '@genfeedai/contracts/interfaces';
import type {
  BrandRenderEvidenceManifestV1,
  BrandRenderEvidenceSnapshotV1,
  BrandRenderEvidenceVerificationV1,
} from '@genfeedai/contracts/interfaces/content/brand-render-evidence.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, HttpException, Injectable } from '@nestjs/common';
import { z } from 'zod';

/** Where the manifest sits on the stored artifact record. */
export const RENDER_EVIDENCE_KEY = 'renderEvidence';

/** Unauthorised, forbidden and not found: the caller may not see this brand. */
const ACCESS_FAILURE_STATUSES = new Set([401, 403, 404]);

const SNAPSHOT_UNAVAILABLE_CODES = new Set([
  'brand_identity_unavailable',
  'brand_identity_integrity_failed',
]);

export interface RenderedOutput {
  /** Ingredient ID the output is stored under. */
  artifactId: string;
  storageKey: string;
  /** The exact bytes stored as the artifact. */
  bytes: Uint8Array;
  /** The renderer's media entry; its observations are parsed strictly. */
  media: IVisualSandboxMedia;
}

/** The slice of a visual revision a manifest is scoped to. */
export interface VisualRenderScope {
  organizationId: string;
  brandId: string;
  userId: string;
  /** Asset IDs the API authorised and staged for this render. */
  sourceAssetIds: unknown;
  /**
   * Brand font asset IDs the API may have staged beside the source assets. A
   * font the renderer reports under any other ID is never credited to an asset.
   */
  brandFontAssetIds?: readonly string[];
  rendererVersion: string;
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

@Injectable()
export class BrandRenderEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: BrandIdentitySnapshotService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * The approved brand revision in effect now. The renderer is not driven by it,
   * so this records which revision the artifact was produced under, not an input.
   */
  async resolveSnapshot(scope: {
    organizationId: string;
    brandId: string;
    userId: string;
  }): Promise<BrandRenderEvidenceSnapshotV1> {
    try {
      const snapshot = await this.snapshots.preview({
        actorId: scope.userId,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
      });
      return {
        binding: 'approved_at_render',
        revisionId: snapshot.revisionId,
        revisionVersion: snapshot.revisionVersion,
        contentHash: snapshot.contentHash,
      };
    } catch (error) {
      // An access failure must keep failing; the snapshot is only context.
      if (
        error instanceof HttpException &&
        ACCESS_FAILURE_STATUSES.has(error.getStatus())
      )
        throw error;
      const isKnown =
        error instanceof ConflictException &&
        SNAPSHOT_UNAVAILABLE_CODES.has(error.message);
      if (!isKnown)
        this.logger.warn('Brand snapshot lookup failed for render evidence', {
          brandId: scope.brandId,
          organizationId: scope.organizationId,
          reason: error instanceof Error ? error.name : 'unknown',
        });
      return {
        binding: 'unavailable',
        reasonCode:
          isKnown && error instanceof Error
            ? error.message
            : 'brand_identity_lookup_failed',
      };
    }
  }

  /**
   * Builds manifests for the outputs of one render, resolving the brand snapshot
   * at most once and only when an output carries observations.
   */
  forRender(scope: VisualRenderScope) {
    const authorizedAssetIds = new Set([
      ...z.array(z.string()).parse(scope.sourceAssetIds),
      ...(scope.brandFontAssetIds ?? []),
    ]);
    let snapshot: Promise<BrandRenderEvidenceSnapshotV1> | undefined;
    return {
      manifestFor: async (
        output: RenderedOutput,
      ): Promise<BrandRenderEvidenceManifestV1 | null> => {
        const { media } = output;
        if (media.evidence === undefined) return null;
        snapshot ??= this.resolveSnapshot(scope);
        const input: BuildBrandRenderEvidenceInput = {
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          artifact: {
            id: output.artifactId,
            storageKey: output.storageKey,
            format: media.format,
            width: media.width,
            height: media.height,
            frame: media.frame,
          },
          bytes: output.bytes,
          observations: media.evidence,
          authorizedAssetIds,
          rendererVersion: scope.rendererVersion,
          brandSnapshot: await snapshot,
          capturedAt: new Date(),
        };
        const built = buildBrandRenderEvidenceManifest(input);
        if (built.reasonCode)
          this.logger.warn('Render evidence omitted for an export', {
            artifactId: output.artifactId,
            reasonCode: built.reasonCode,
          });
        return built.manifest;
      },
    };
  }

  /**
   * Reads the manifest stored with an artifact and checks it against the bytes
   * the caller holds. Only a `verified` result may be relied on.
   */
  async read(
    scope: { organizationId: string; brandId: string },
    artifactId: string,
    bytes: Uint8Array,
  ): Promise<BrandRenderEvidenceVerificationV1> {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: {
        id: artifactId,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        isDeleted: false,
      },
      select: { providerData: true },
    });
    return verifyBrandRenderEvidenceManifest(
      recordOf(ingredient?.providerData)[RENDER_EVIDENCE_KEY],
      {
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        artifactId,
        bytes,
      },
    );
  }
}

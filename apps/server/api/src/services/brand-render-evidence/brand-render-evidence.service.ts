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
import { ConflictException, Injectable } from '@nestjs/common';
import { z } from 'zod';

/** Where the manifest sits on the stored artifact record. */
export const RENDER_EVIDENCE_KEY = 'renderEvidence';

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
      if (
        error instanceof ConflictException &&
        SNAPSHOT_UNAVAILABLE_CODES.has(error.message)
      )
        return { binding: 'unavailable', reasonCode: error.message };
      throw error;
    }
  }

  /**
   * Builds manifests for the outputs of one render, resolving the brand snapshot
   * at most once and only when an output carries observations.
   */
  forRender(scope: VisualRenderScope) {
    const authorizedAssetIds = new Set(
      z.array(z.string()).parse(scope.sourceAssetIds),
    );
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
        return buildBrandRenderEvidenceManifest(input).manifest;
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

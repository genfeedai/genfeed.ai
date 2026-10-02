import {
  assertBrandIdentityAssetsAvailable,
  projectApprovedBrandIdentitySnapshot,
} from '@api/services/branded-generation-receipts/brand-identity-snapshot-projection.util';
import { hashBrandIdentitySnapshotV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type { BrandedGenerationActorV1 } from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { brandIdentitySnapshotV1Schema } from '@genfeedai/contracts/api-types/contracts';
import { learningContractIdSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { AssetParent, BrandOsRevisionStatus, Prisma } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class BrandIdentitySnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BrandedGenerationReceiptAccessService,
    private readonly receipts: BrandedGenerationReceiptsService,
  ) {}
  async preview(
    actor: BrandedGenerationActorV1,
    receiptId?: string,
  ): Promise<BrandIdentitySnapshotV1> {
    if (
      ![
        actor.actorId,
        actor.organizationId,
        actor.brandId,
        ...(receiptId === undefined ? [] : [receiptId]),
      ].every((id) => learningContractIdSchema.safeParse(id).success)
    )
      throw new BadRequestException('receipt_query_invalid');
    if (receiptId !== undefined) {
      // Existing read authority precedes snapshot inspection; no prompt store is involved.
      const receipt = await this.receipts.get(actor, receiptId);
      if (receipt.snapshot === null)
        throw new ConflictException('brand_identity_snapshot_unavailable');
      const parsed = brandIdentitySnapshotV1Schema.safeParse(receipt.snapshot);
      if (
        !parsed.success ||
        receipt.organizationId !== actor.organizationId ||
        receipt.brandId !== actor.brandId ||
        parsed.data.organizationId !== actor.organizationId ||
        parsed.data.brandId !== actor.brandId ||
        hashBrandIdentitySnapshotV1(parsed.data) !== parsed.data.contentHash
      )
        throw new ConflictException('brand_identity_integrity_failed');
      return receipt.snapshot;
    }
    return this.prisma.$transaction(
      async (tx) => {
        await this.access.assertBrand(actor, tx);
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "brands" WHERE "id" = ${actor.brandId} AND "organizationId" = ${actor.organizationId} AND "isDeleted" = false FOR SHARE`,
        );
        await this.access.assertBrand(actor, tx);
        const revisions = await tx.brandOsRevision.findMany({
          where: {
            organizationId: actor.organizationId,
            brandId: actor.brandId,
            isDeleted: false,
            status: BrandOsRevisionStatus.APPROVED,
          },
          take: 2,
        });
        if (revisions.length !== 1)
          throw new ConflictException('brand_identity_unavailable');
        const revision = revisions[0];
        if (
          revision.organizationId !== actor.organizationId ||
          revision.brandId !== actor.brandId
        )
          throw new ConflictException('brand_identity_integrity_failed');
        const snapshot = projectApprovedBrandIdentitySnapshot(
          revision,
          new Date().toISOString(),
        );
        const ids = [
          ...new Set(
            snapshot.generationRules.assets.map((asset) => asset.assetId),
          ),
        ];
        const assets = ids.length
          ? await tx.asset.findMany({
              where: {
                id: { in: ids },
                parentType: AssetParent.BRAND,
                parentOrgId: actor.organizationId,
                parentBrandId: actor.brandId,
                isDeleted: false,
              },
              take: 64,
            })
          : [];
        assertBrandIdentityAssetsAvailable(snapshot, assets);
        return snapshot;
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 },
    );
  }
}

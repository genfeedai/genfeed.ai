import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { readRecord } from '@genfeedai/utils/data/extract.util';

/** An admitted Extend run must still point at the same stored source bytes at dispatch. */
export async function assertWorkflowExtensionSourceEvidence(
  prisma: PrismaService,
  files: FilesClientService,
  input: {
    organizationId: string;
    brandId: string;
    parentIngredientId: unknown;
    sourceEvidence: unknown;
    frameIngredientId?: unknown;
  },
): Promise<void> {
  const proof = readRecord(input.sourceEvidence);
  if (
    typeof proof.assetId !== 'string' ||
    proof.assetId !== input.parentIngredientId ||
    typeof proof.sourceKey !== 'string' ||
    !proof.sourceKey ||
    typeof proof.sourceVersion !== 'string' ||
    !/^[a-f0-9]{64}$/.test(proof.sourceVersion) ||
    typeof proof.sizeBytes !== 'number' ||
    !Number.isSafeInteger(proof.sizeBytes) ||
    proof.sizeBytes <= 0
  )
    throw new Error('Workflow Extend source evidence is unavailable');
  const source = await prisma.ingredient.findFirst({
    select: { s3Key: true },
    where: {
      id: proof.assetId,
      organizationId: input.organizationId,
      brandId: input.brandId,
      isDeleted: false,
      category: IngredientCategory.VIDEO,
      status: { in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED] },
    },
  });
  if (source?.s3Key !== proof.sourceKey)
    throw new Error('Workflow Extend source evidence changed');
  const url = await files.getPresignedDownloadUrlForObjectKey(proof.sourceKey);
  const measured = await files.fingerprintMedia(url);
  if (
    measured.assetHash !== proof.sourceVersion ||
    measured.sizeBytes !== proof.sizeBytes
  )
    throw new Error('Workflow Extend source evidence changed');
  if (input.frameIngredientId !== undefined) {
    if (typeof input.frameIngredientId !== 'string' || !input.frameIngredientId)
      throw new Error('Workflow Extend last frame is unavailable');
    const frame = await prisma.ingredient.findFirst({
      select: { s3Key: true },
      where: {
        id: input.frameIngredientId,
        organizationId: input.organizationId,
        brandId: input.brandId,
        parentId: proof.assetId,
        isDeleted: false,
        category: IngredientCategory.IMAGE,
        status: {
          in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
        },
      },
    });
    const frameProof = readRecord(proof.frame);
    if (
      !frame?.s3Key ||
      frameProof.assetId !== input.frameIngredientId ||
      frameProof.sourceKey !== frame.s3Key ||
      typeof frameProof.sourceVersion !== 'string' ||
      !/^[a-f0-9]{64}$/.test(frameProof.sourceVersion) ||
      typeof frameProof.sizeBytes !== 'number' ||
      !Number.isSafeInteger(frameProof.sizeBytes) ||
      frameProof.sizeBytes <= 0
    )
      throw new Error('Workflow Extend last frame is unavailable');
    const frameUrl = await files.getPresignedDownloadUrlForObjectKey(
      frame.s3Key,
    );
    const frameBytes = await files.fingerprintMedia(frameUrl);
    if (
      frameBytes.assetHash !== frameProof.sourceVersion ||
      frameBytes.sizeBytes !== frameProof.sizeBytes
    )
      throw new Error('Workflow Extend last frame changed');
  }
}

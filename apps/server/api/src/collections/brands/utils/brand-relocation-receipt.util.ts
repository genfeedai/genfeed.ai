import { BrandRelocationStatus } from '@genfeedai/contracts';
import type { IBrandRelocationSummary } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { ConflictException } from '@nestjs/common';

export async function claimRelocationReceipt(
  tx: Prisma.TransactionClient,
  id: string,
  brandId: string,
  organizationId: string,
  destinationOrganizationId: string,
): Promise<void> {
  const claimed = await tx.brandRelocation.updateMany({
    where: {
      id,
      brandId,
      organizationId,
      destinationOrganizationId,
      isDeleted: false,
      status: BrandRelocationStatus.PROCESSING,
    },
    data: { updatedAt: new Date() },
  });
  if (claimed.count !== 1)
    throw new ConflictException('This brand move has already finished');
}

export async function completeRelocationReceipt(
  tx: Prisma.TransactionClient,
  id: string,
  organizationId: string,
  summary: IBrandRelocationSummary,
): Promise<void> {
  await tx.brandRelocation.update({
    where: { id, organizationId, isDeleted: false },
    data: { status: BrandRelocationStatus.DONE, summary: { ...summary } },
  });
}

export async function refreshRelocationReceiptSummary(
  prisma: Pick<Prisma.TransactionClient, 'brandRelocation'>,
  id: string,
  organizationId: string,
  summary: IBrandRelocationSummary,
  logger: Pick<LoggerService, 'warn'>,
): Promise<void> {
  try {
    await prisma.brandRelocation.update({
      where: { id, organizationId, isDeleted: false },
      data: { summary: { ...summary } },
    });
  } catch (error) {
    logger.warn('Could not refresh committed brand move scheduling summary', {
      relocationId: id,
      error,
    });
  }
}

export function stripRelocationOrganization<
  T extends { organizationId?: string },
>(dto: T): Omit<T, 'organizationId'> {
  const { organizationId: _omitOrg, ...rest } = dto;
  return rest;
}

export function pickRelocationPassthrough(
  dto: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    fields
      .filter((key) => Object.hasOwn(dto, key) && dto[key] !== undefined)
      .map((key) => [key, dto[key]]),
  );
}

export interface RelocationSummaryInput {
  membersSevered: number;
  personaGrantsRevoked: number;
  personasSharingReset: number;
  workflowsMoved: number;
  heldSchedules: readonly unknown[];
}

export function toRelocationSummary(
  result: RelocationSummaryInput,
  schedulingPending: number,
): IBrandRelocationSummary {
  return {
    membersSevered: result.membersSevered,
    personaGrantsRevoked: result.personaGrantsRevoked,
    personasSharingReset: result.personasSharingReset,
    schedulesHeld: result.heldSchedules.length,
    schedulingPending,
    workflowsMoved: result.workflowsMoved,
  };
}

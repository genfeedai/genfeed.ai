import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PostStatus } from '@genfeedai/contracts';
import {
  type ClockTime,
  clockTimeMinutes,
  findNextFreeSlot,
  MAX_NEXT_SLOT_DAYS,
  type NextPostingSlot,
  normalizePostingTimes,
  resolvePostingTimezone,
} from '@genfeedai/contracts/api-types/contracts/credential-posting-times.contract';
import type { Prisma } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

const OCCUPYING_POST_STATUSES: string[] = [
  PostStatus.DRAFT,
  PostStatus.PENDING,
  PostStatus.PRIVATE,
  PostStatus.PROCESSING,
  PostStatus.PUBLIC,
  PostStatus.SCHEDULED,
  PostStatus.UNLISTED,
];

type CredentialRow = {
  brandId: string | null;
  id: string;
  postingTimes: Prisma.JsonValue;
};

@Injectable()
export class CredentialPostingTimesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    credentialId: string,
  ): Promise<ClockTime[]> {
    const credential = await this.requireCredential(
      organizationId,
      credentialId,
    );
    return normalizePostingTimes(credential.postingTimes);
  }

  async add(
    organizationId: string,
    credentialId: string,
    time: ClockTime,
  ): Promise<ClockTime[]> {
    const credential = await this.requireCredential(
      organizationId,
      credentialId,
    );
    const nextTimes = normalizePostingTimes([
      ...normalizePostingTimes(credential.postingTimes),
      time,
    ]);
    return this.persistTimes(organizationId, credential.id, nextTimes);
  }

  async remove(
    organizationId: string,
    credentialId: string,
    time: ClockTime,
  ): Promise<ClockTime[]> {
    const credential = await this.requireCredential(
      organizationId,
      credentialId,
    );
    const remaining = normalizePostingTimes(credential.postingTimes).filter(
      (entry) => clockTimeMinutes(entry) !== clockTimeMinutes(time),
    );
    return this.persistTimes(organizationId, credential.id, remaining);
  }

  async replace(
    organizationId: string,
    credentialId: string,
    times: ClockTime[],
  ): Promise<ClockTime[]> {
    const credential = await this.requireCredential(
      organizationId,
      credentialId,
    );
    return this.persistTimes(
      organizationId,
      credential.id,
      normalizePostingTimes(times),
    );
  }

  async findNextSlot(
    organizationId: string,
    credentialId: string,
    after?: string,
  ): Promise<NextPostingSlot> {
    const credential = await this.requireCredential(
      organizationId,
      credentialId,
    );
    const preferredTimes = normalizePostingTimes(credential.postingTimes);
    if (preferredTimes.length === 0) {
      return { found: false };
    }

    const afterDate = after ? new Date(after) : new Date();
    if (Number.isNaN(afterDate.getTime())) {
      throw new BadRequestException('after must be a valid ISO-8601 instant.');
    }

    const timezone = await this.resolveBrandTimezone(
      organizationId,
      credential.brandId,
    );
    const occupiedInstants = await this.listOccupiedInstants({
      after: afterDate,
      brandId: credential.brandId,
      credentialId: credential.id,
      organizationId,
    });

    return findNextFreeSlot({
      after: afterDate,
      occupiedInstants,
      preferredTimes,
      timezone,
    });
  }

  private async requireCredential(
    organizationId: string,
    credentialId: string,
  ): Promise<CredentialRow> {
    const credential = (await this.prisma.credential.findFirst({
      select: {
        brandId: true,
        id: true,
        postingTimes: true,
      },
      where: scopedWhere(organizationId, { id: credentialId }),
    })) as CredentialRow | null;
    if (!credential) {
      throw new NotFoundException('Credential', credentialId);
    }
    return credential;
  }

  private async persistTimes(
    organizationId: string,
    credentialId: string,
    times: ClockTime[],
  ): Promise<ClockTime[]> {
    const updated = await this.prisma.credential.updateMany({
      data: {
        postingTimes: times as Prisma.InputJsonValue,
      },
      where: scopedWhere(organizationId, { id: credentialId }),
    });
    if (updated.count !== 1) {
      throw new NotFoundException('Credential', credentialId);
    }
    return times;
  }

  private async resolveBrandTimezone(
    organizationId: string,
    brandId: string | null,
  ): Promise<string> {
    if (!brandId) {
      return 'UTC';
    }

    const brand = await this.prisma.brand.findFirst({
      select: { agentConfig: true },
      where: scopedWhere(organizationId, { id: brandId }),
    });
    if (!brand?.agentConfig || typeof brand.agentConfig !== 'object') {
      return 'UTC';
    }
    if (Array.isArray(brand.agentConfig)) {
      return 'UTC';
    }

    const schedule = (brand.agentConfig as Record<string, unknown>).schedule;
    if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
      return 'UTC';
    }
    const timezone = (schedule as Record<string, unknown>).timezone;
    return resolvePostingTimezone(
      typeof timezone === 'string' ? timezone : undefined,
    );
  }

  private async listOccupiedInstants(input: {
    after: Date;
    brandId: string | null;
    credentialId: string;
    organizationId: string;
  }): Promise<Date[]> {
    const windowStart = new Date(input.after.getTime() - MILLISECONDS_PER_DAY);
    const windowEnd = new Date(
      input.after.getTime() + MAX_NEXT_SLOT_DAYS * MILLISECONDS_PER_DAY,
    );
    const rows = await this.prisma.post.findMany({
      select: {
        publishedAt: true,
        scheduledDate: true,
      },
      where: scopedWhere(input.organizationId, {
        credentialId: input.credentialId,
        ...(input.brandId ? { brandId: input.brandId } : {}),
        status: { in: OCCUPYING_POST_STATUSES },
        OR: [
          { scheduledDate: { gte: windowStart, lte: windowEnd } },
          { publishedAt: { gte: windowStart, lte: windowEnd } },
        ],
      }),
    });

    return rows.flatMap((row) => {
      const instant = row.scheduledDate ?? row.publishedAt;
      return instant ? [instant] : [];
    });
  }
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

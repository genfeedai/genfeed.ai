import { isDisposableEmail } from '@api/auth/shared/signup-email-policy.util';
import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { JoinWaitlistDto } from '@api/collections/waitlist/dto/join-waitlist.dto';
import { ReviewWaitlistEntryDto } from '@api/collections/waitlist/dto/review-waitlist-entry.dto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PageWindow } from '@api/helpers/dto/pagination-query.dto';
import { buildPaginatedResult } from '@api/helpers/utils/paginated-result/paginated-result.util';
import { buildSearchWhere } from '@api/helpers/utils/search-where/search-where.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { WaitlistStatus } from '@genfeedai/contracts';
import { Prisma, type WaitlistEntry } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, Injectable } from '@nestjs/common';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

function trimOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The public waitlist for a closed signup, and the operator's review of it.
 *
 * Joining is idempotent and says nothing about an existing entry, so the
 * public form cannot be used to learn who is already on the list or what the
 * operator decided. An approved email may create an account while signup is
 * invite-only (see the Better Auth signup gate).
 */
@Traced()
@Injectable()
export class WaitlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async isSignupInviteOnly(): Promise<boolean> {
    return (await this.platformSettings.getFeatureSettings())
      .isSignupInviteOnly;
  }

  async join(dto: JoinWaitlistDto, referrerDomain?: string): Promise<void> {
    const email = dto.email.trim().toLowerCase();
    if (isDisposableEmail(email)) {
      throw new BadRequestException(
        'Temporary email addresses are not supported. Use a permanent address.',
      );
    }

    const details = {
      name: trimOptional(dto.name),
      useCase: trimOptional(dto.useCase),
      website: trimOptional(dto.website),
    };

    // tenant-scope-ignore: the waitlist is platform-level and belongs to no organization
    const existing = await this.prisma.waitlistEntry.findFirst({
      select: { id: true, isDeleted: true, status: true },
      where: { email },
    });

    if (!existing) {
      try {
        // tenant-scope-ignore: the waitlist is platform-level and belongs to no organization
        await this.prisma.waitlistEntry.create({
          data: { email, referrerDomain: referrerDomain ?? null, ...details },
        });
      } catch (error) {
        // A concurrent join for the same email won the unique index.
        if (
          !(
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === UNIQUE_CONSTRAINT_ERROR_CODE
          )
        ) {
          throw error;
        }
      }
      return;
    }

    // Only a lead still waiting may refine what they told us; a decided entry
    // is never reopened from the public form.
    if (!existing.isDeleted && existing.status === WaitlistStatus.PENDING) {
      // tenant-scope-ignore: the waitlist is platform-level and belongs to no organization
      await this.prisma.waitlistEntry.update({
        data: {
          ...(details.name ? { name: details.name } : {}),
          ...(details.useCase ? { useCase: details.useCase } : {}),
          ...(details.website ? { website: details.website } : {}),
        },
        where: { id: existing.id },
      });
    }
  }

  async list({
    limit,
    page,
    search,
    skip,
    status,
  }: PageWindow & {
    search?: string;
    status?: WaitlistStatus;
  }): Promise<AggregatePaginateResult<WaitlistEntry>> {
    const where: Prisma.WaitlistEntryWhereInput = {
      isDeleted: false,
      ...(status ? { status } : {}),
      ...buildSearchWhere<Prisma.WaitlistEntryWhereInput>(search, {
        columns: ['email', 'name', 'website', 'useCase'],
      }),
    };
    const [entries, totalDocs] = await Promise.all([
      // tenant-scope-ignore: the waitlist is platform-level and belongs to no organization
      this.prisma.waitlistEntry.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        where,
      }),
      // tenant-scope-ignore: the waitlist is platform-level and belongs to no organization
      this.prisma.waitlistEntry.count({ where }),
    ]);

    return buildPaginatedResult(entries, totalDocs, page, limit);
  }

  async review(
    id: string,
    actorUserId: string,
    dto: ReviewWaitlistEntryDto,
  ): Promise<WaitlistEntry> {
    // tenant-scope-ignore: the waitlist is platform-level and belongs to no organization
    const entry = await this.prisma.waitlistEntry.findFirst({
      select: { id: true },
      where: { id, isDeleted: false },
    });
    if (!entry) {
      throw new NotFoundException('Waitlist entry');
    }

    // tenant-scope-ignore: the waitlist is platform-level and belongs to no organization
    return this.prisma.waitlistEntry.update({
      data: {
        reviewedAt: new Date(),
        reviewedByUserId: actorUserId,
        reviewNote: trimOptional(dto.reviewNote),
        status: dto.status,
      },
      where: { id },
    });
  }
}

import type { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import {
  type BrandRelocationActingUser,
  BrandRelocationService,
} from '@api/collections/brands/services/brand-relocation.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  ActivitySource,
  BrandRelocationStatus,
} from '@genfeedai/contracts';
import type { IBrandRelocationSummary } from '@genfeedai/contracts/interfaces';
import { BRAND_RELOCATION_QUEUE } from '@genfeedai/contracts/queue';
import { type BrandRelocation, type Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  crossOrgUnsafe,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import type { Queue } from 'bullmq';

interface RelocationPayload {
  actor: BrandRelocationActingUser;
  updates: Partial<UpdateBrandDto> & { organizationId: string };
}

@Injectable()
export class BrandRelocationJobsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(BRAND_RELOCATION_QUEUE) private readonly queue: Queue,
    private readonly relocation: BrandRelocationService,
    private readonly recorder: ActivityRecorderService,
    private readonly logger: LoggerService,
  ) {}

  async enqueue(
    brandId: string,
    id: string,
    updates: Partial<UpdateBrandDto>,
    actor: BrandRelocationActingUser,
  ): Promise<BrandRelocation> {
    const destinationOrganizationId = updates.organizationId;
    if (!destinationOrganizationId)
      throw new BadRequestException('A destination organization is required');
    return crossOrgUnsafe(async () => {
      const existing = await this.prisma.brandRelocation.findFirst({
        where: { id, isDeleted: false },
      });
      if (existing) {
        await this.assertAccess(existing, actor);
        if (
          existing.brandId !== brandId ||
          existing.destinationOrganizationId !== destinationOrganizationId
        ) {
          throw new ConflictException(
            'This move identifier already belongs to another request',
          );
        }
        await this.dispatch(existing);
        return existing;
      }
      const brand = await this.relocation.authorizeRelocation(
        brandId,
        destinationOrganizationId,
        actor,
      );
      if (brand.organizationId === destinationOrganizationId)
        throw new ConflictException(
          'This brand already belongs to the destination organization',
        );
      let operation: BrandRelocation;
      try {
        operation = await this.prisma.brandRelocation.create({
          data: {
            id,
            brandId,
            organizationId: brand.organizationId,
            destinationOrganizationId,
            userId: actor.userId,
            status: BrandRelocationStatus.PROCESSING,
            payload: JSON.parse(
              JSON.stringify({ actor, updates }),
            ) as Prisma.InputJsonObject,
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
        const active = await this.prisma.brandRelocation.findFirst({
          where: {
            brandId,
            status: BrandRelocationStatus.PROCESSING,
            isDeleted: false,
          },
        });
        if (!active)
          throw new ConflictException(
            'This move request already exists. Check its status before retrying.',
          );
        await this.assertAccess(active, actor);
        if (active.destinationOrganizationId !== destinationOrganizationId)
          throw new ConflictException(
            'A move to another organization is already processing',
          );
        operation = active;
      }
      await this.dispatch(operation);
      return operation;
    });
  }

  async get(
    brandId: string,
    id: string,
    actor: BrandRelocationActingUser,
  ): Promise<BrandRelocation> {
    return crossOrgUnsafe(async () => {
      let operation = await this.prisma.brandRelocation.findFirst({
        where: { id, brandId, isDeleted: false },
      });
      if (!operation) throw new NotFoundException('Brand move', id);
      await this.assertAccess(operation, actor);
      if (operation.status === BrandRelocationStatus.PROCESSING) {
        const job = await this.queue.getJob(id);
        if (job && (await job.getState()) === 'failed') {
          // The transaction locks this receipt before touching ownership. This
          // CAS waits for it and cannot overwrite a concurrently committed done.
          await this.prisma.brandRelocation.updateMany({
            where: {
              id,
              organizationId: operation.organizationId,
              isDeleted: false,
              status: BrandRelocationStatus.PROCESSING,
            },
            data: {
              status: BrandRelocationStatus.FAILED,
              error:
                'The background move stopped before committing. Please try again.',
            },
          });
          operation = await this.prisma.brandRelocation.findFirstOrThrow({
            where: {
              id,
              organizationId: operation.organizationId,
              isDeleted: false,
            },
          });
        } else if (!job) {
          await this.dispatch(operation);
        }
      }
      return operation;
    });
  }

  async process(id: string, isFinalAttempt: boolean): Promise<void> {
    return crossOrgUnsafe(async () => {
      const operation = await this.prisma.brandRelocation.findFirst({
        where: { id, isDeleted: false },
      });
      if (!operation || operation.status !== BrandRelocationStatus.PROCESSING)
        return;
      const payload = operation.payload as unknown as RelocationPayload;
      try {
        const brand = await this.prisma.brand.findFirst({
          where: {
            id: operation.brandId,
            organizationId: operation.organizationId,
            isDeleted: false,
          },
        });
        if (!brand)
          throw new ConflictException(
            'The brand no longer belongs to the source organization',
          );
        const { summary } = await this.relocation.relocateToOrganization(
          operation.brandId,
          payload.updates,
          payload.actor,
          undefined,
          operation.id,
        );
        await this.recordActivity(
          operation,
          brand.userId ?? operation.userId,
          summary,
        );
      } catch (error) {
        const committed = await this.prisma.brandRelocation.findFirst({
          where: {
            id,
            organizationId: operation.organizationId,
            isDeleted: false,
          },
        });
        if (committed?.status === BrandRelocationStatus.DONE) {
          this.logger.warn('Brand move committed before a post-commit error', {
            operationId: id,
            error,
          });
          return;
        }
        const isRefused =
          error instanceof HttpException && error.getStatus() < 500;
        if (!isFinalAttempt && !isRefused) throw error;
        await this.prisma.brandRelocation.updateMany({
          where: {
            id,
            organizationId: operation.organizationId,
            isDeleted: false,
            status: BrandRelocationStatus.PROCESSING,
          },
          data: {
            status: BrandRelocationStatus.FAILED,
            error:
              error instanceof HttpException
                ? error.message
                : 'The move could not complete and was rolled back. Please try again.',
          },
        });
        this.logger.error('Brand move rolled back', error, { operationId: id });
      }
    });
  }

  private async assertAccess(
    operation: BrandRelocation,
    actor: BrandRelocationActingUser,
  ): Promise<void> {
    if (operation.userId !== actor.userId)
      throw new ForbiddenException('This move belongs to another user');
    await this.relocation.assertCanRelocate(
      actor,
      operation.organizationId,
      operation.destinationOrganizationId,
    );
  }

  private async dispatch(operation: BrandRelocation): Promise<void> {
    if (operation.status !== BrandRelocationStatus.PROCESSING) return;
    try {
      await this.queue.add(
        'relocate',
        { operationId: operation.id },
        {
          jobId: operation.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { age: 604800, count: 1000 },
        },
      );
    } catch (error) {
      // A broker can accept add() and lose its reply. The durable receipt stays
      // processing; the next status read safely offers the same job id again.
      this.logger.warn('Brand move dispatch will be retried', {
        operationId: operation.id,
        error,
      });
    }
  }

  private async recordActivity(
    operation: BrandRelocation,
    userId: string,
    summary: IBrandRelocationSummary,
  ): Promise<void> {
    for (const organizationId of [
      operation.destinationOrganizationId,
      operation.organizationId,
    ]) {
      try {
        await runWithTenantContext(
          { organizationId },
          async () =>
            await this.recorder.record({
              id: `${operation.id}-${organizationId}`,
              brandId:
                organizationId === operation.destinationOrganizationId
                  ? operation.brandId
                  : null,
              data: {
                brandId: operation.brandId,
                sourceOrganizationId: operation.organizationId,
                destinationOrganizationId: operation.destinationOrganizationId,
              },
              key: ActivityKey.BRAND_RELOCATED,
              source: ActivitySource.BRAND_RELOCATION,
              organizationId,
              userId,
              value: JSON.stringify(summary),
            }),
        );
      } catch (error) {
        this.logger.error('Failed to record brand relocation activity', error, {
          operationId: operation.id,
          organizationId,
        });
      }
    }
  }
}

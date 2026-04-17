import { randomUUID } from 'node:crypto';
import {
  AppendRunEventDto,
  CreateRunDto,
  RunEventEnvelopeDto,
  RunQueryDto,
  UpdateRunDto,
} from '@api/collections/runs/dto/create-run.dto';
import {
  type RunDocument,
  type RunEvent,
} from '@api/collections/runs/schemas/run.schema';
import { RunsMeteringService } from '@api/collections/runs/services/runs-metering.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  RunActionType,
  RunAuthType,
  RunEventType,
  RunMeteringStage,
  RunStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class RunsService extends BaseService<
  RunDocument,
  CreateRunDto,
  UpdateRunDto
> {
  constructor(
    public readonly prisma: PrismaService,
    readonly logger: LoggerService,
    private readonly notificationsPublisher: NotificationsPublisherService,
    private readonly runsMeteringService: RunsMeteringService,
  ) {
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
  }

  private runId(run: Pick<RunDocument, '_id'>): string {
    return String(run?._id || '');
  }

  private sortEvents(events: RunEvent[]): RunEvent[] {
    return [...events].sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() -
        new Date(b.createdAt || 0).getTime(),
    );
  }

  private buildEventEnvelope(
    run: RunDocument,
    event: RunEvent,
    sequence: number,
  ): RunEventEnvelopeDto {
    return {
      actionType: run.actionType,
      event: {
        createdAt: event.createdAt,
        message: event.message,
        payload: event.payload,
        sequence,
        source: event.source,
        traceId: event.traceId,
        type: event.type,
      },
      progress: run.progress,
      runId: this.runId(run),
      status: run.status,
      surface: run.surface,
      timestamp: new Date(event.createdAt || new Date()).toISOString(),
      traceId: event.traceId || run.traceId,
    };
  }

  private async publishEventEnvelope(
    run: RunDocument,
    event: RunEvent,
    sequence: number,
  ): Promise<void> {
    try {
      await this.notificationsPublisher.emit(
        `/runs/${this.runId(run)}/events`,
        this.buildEventEnvelope(run, event, sequence),
      );
    } catch (error: unknown) {
      this.logger?.warn('Failed to publish run event stream message', {
        error: error instanceof Error ? error.message : String(error),
        runId: this.runId(run),
        type: event.type,
      });
    }
  }

  private async fireMeteringHook(
    run: RunDocument,
    stage: RunMeteringStage,
  ): Promise<void> {
    await this.runsMeteringService.record({
      actionType: run.actionType,
      authType: run.authType,
      organizationId: String(run.organization),
      progress: run.progress,
      runId: this.runId(run),
      stage,
      status: run.status,
      surface: run.surface,
      traceId: run.traceId,
      userId: String(run.user),
    });
  }

  private isTerminalStatus(status: RunStatus): boolean {
    return (
      status === RunStatus.COMPLETED ||
      status === RunStatus.FAILED ||
      status === RunStatus.CANCELLED
    );
  }

  private isAnalyticsAction(actionType: RunActionType): boolean {
    return (
      actionType === RunActionType.ANALYTICS ||
      actionType === RunActionType.COMPOSITE
    );
  }

  private buildLifecycleEvents(
    previousRun: RunDocument,
    dto: UpdateRunDto,
  ): AppendRunEventDto[] {
    const events: AppendRunEventDto[] = [];

    if (dto.progress !== undefined) {
      events.push({
        message: `Run progress updated to ${dto.progress}%`,
        payload: {
          progress: dto.progress,
          status: dto.status ?? previousRun.status,
        },
        source: 'runs.service',
        type: RunEventType.PROGRESS,
      });
    }

    if (dto.output !== undefined) {
      const outputType = this.isAnalyticsAction(previousRun.actionType)
        ? RunEventType.ANALYTICS_SNAPSHOT
        : RunEventType.OUTPUT_READY;

      events.push({
        message:
          outputType === RunEventType.ANALYTICS_SNAPSHOT
            ? 'Analytics snapshot produced'
            : 'Run output available',
        payload: dto.output,
        source: 'runs.service',
        type: outputType,
      });
    }

    if (dto.error !== undefined) {
      events.push({
        message: dto.error,
        payload: {
          error: dto.error,
        },
        source: 'runs.service',
        type: RunEventType.FAILED,
      });
    }

    if (dto.status !== undefined) {
      const statusEventMap: Record<RunStatus, RunEventType> = {
        [RunStatus.CANCELLED]: RunEventType.CANCELLED,
        [RunStatus.COMPLETED]: RunEventType.COMPLETED,
        [RunStatus.FAILED]: RunEventType.FAILED,
        [RunStatus.PENDING]: RunEventType.UPDATED,
        [RunStatus.RUNNING]: RunEventType.STARTED,
      };

      events.push({
        message: `Run status changed to ${dto.status}`,
        payload: {
          status: dto.status,
        },
        source: 'runs.service',
        type: statusEventMap[dto.status],
      });
    }

    return events;
  }

  async createRun(
    userId: string,
    organizationId: string,
    authType: RunAuthType,
    dto: CreateRunDto,
  ): Promise<{ reused: boolean; run: RunDocument }> {
    if (dto.idempotencyKey) {
      const existingRun = await this.findOne({
        idempotencyKey: dto.idempotencyKey,
        isDeleted: false,
        organizationId,
      });

      if (existingRun) {
        await this.fireMeteringHook(existingRun, RunMeteringStage.CREATED);
        return { reused: true, run: existingRun };
      }
    }

    const traceId =
      dto.traceId?.trim() || dto.correlationId?.trim() || randomUUID();

    const runCreatedEvent: RunEvent = {
      createdAt: new Date(),
      message: 'Run created',
      source: dto.surface,
      traceId,
      type: RunEventType.CREATED,
    };

    const run = (await this.create({
      ...dto,
      authType,
      correlationId: dto.correlationId || traceId,
      events: [runCreatedEvent],
      organizationId,
      progress: 0,
      status: RunStatus.PENDING,
      traceId,
      userId,
    } as unknown as CreateRunDto)) as RunDocument;

    await this.publishEventEnvelope(run, runCreatedEvent, 0);
    await this.fireMeteringHook(run, RunMeteringStage.CREATED);

    return { reused: false, run };
  }

  async listRuns(
    organizationId: string,
    query: RunQueryDto,
  ): Promise<{
    items: RunDocument[];
    limit: number;
    offset: number;
    total: number;
  }> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);

    const filters: Record<string, unknown> = {
      isDeleted: false,
      organizationId,
    };

    if (query.status) {
      filters.status = query.status;
    }

    if (query.actionType) {
      filters.actionType = query.actionType;
    }

    if (query.surface) {
      filters.surface = query.surface;
    }

    const [items, total] = await Promise.all([
      this.prisma.run.findMany({
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        where: filters as never,
      }),
      this.prisma.run.count({ where: filters as never }),
    ]);

    return {
      items: items as unknown as RunDocument[],
      limit,
      offset,
      total,
    };
  }

  async getRun(
    runId: string,
    organizationId: string,
  ): Promise<RunDocument | null> {
    const result = await this.prisma.run.findFirst({
      where: { id: runId, isDeleted: false, organizationId },
    });
    return result as unknown as RunDocument | null;
  }

  async getById(
    runId: string,
    organizationId: string,
  ): Promise<RunDocument | null> {
    return this.getRun(runId, organizationId);
  }

  async executeRun(
    runId: string,
    organizationId: string,
  ): Promise<RunDocument | null> {
    const run = await this.getRun(runId, organizationId);

    if (!run) {
      return null;
    }

    if (this.isTerminalStatus(run.status)) {
      return run;
    }

    const now = new Date();

    const updated = await this.prisma.run.update({
      data: {
        progress: run.progress > 0 ? run.progress : 1,
        startedAt: run.startedAt ?? now,
        status: RunStatus.RUNNING,
      },
      where: { id: runId },
    });

    if (!updated) {
      return null;
    }

    const withEvent =
      (await this.appendEventForRun(runId, organizationId, {
        message: 'Run execution started',
        source: 'runs.service',
        type: RunEventType.STARTED,
      })) ?? (updated as unknown as RunDocument);

    await this.fireMeteringHook(withEvent, RunMeteringStage.EXECUTED);

    return withEvent;
  }

  async cancelRun(
    runId: string,
    organizationId: string,
  ): Promise<RunDocument | null> {
    const run = await this.getRun(runId, organizationId);

    if (!run) {
      return null;
    }

    if (this.isTerminalStatus(run.status)) {
      return run;
    }

    const completedAt = new Date();

    const updated = await this.prisma.run.update({
      data: {
        completedAt,
        durationMs: run.startedAt
          ? completedAt.getTime() - (run.startedAt as Date).getTime()
          : undefined,
        status: RunStatus.CANCELLED,
      },
      where: { id: runId },
    });

    if (!updated) {
      return null;
    }

    const withEvent =
      (await this.appendEventForRun(runId, organizationId, {
        message: 'Run cancelled',
        source: 'runs.service',
        type: RunEventType.CANCELLED,
      })) ?? (updated as unknown as RunDocument);

    await this.fireMeteringHook(withEvent, RunMeteringStage.CANCELLED);

    return withEvent;
  }

  async updateRun(
    runId: string,
    organizationId: string,
    dto: UpdateRunDto,
  ): Promise<RunDocument | null> {
    const run = await this.getRun(runId, organizationId);

    if (!run) {
      return null;
    }

    const updatePayload: Record<string, unknown> = {};

    if (dto.status !== undefined) {
      updatePayload.status = dto.status;
    }

    if (dto.progress !== undefined) {
      updatePayload.progress = dto.progress;
    }

    if (dto.output !== undefined) {
      updatePayload.output = dto.output;
    }

    if (dto.error !== undefined) {
      updatePayload.error = dto.error;
    }

    const now = new Date();
    const nextStatus = dto.status ?? run.status;

    if (nextStatus === RunStatus.RUNNING && !run.startedAt) {
      updatePayload.startedAt = now;
    }

    if (this.isTerminalStatus(nextStatus) && !run.completedAt) {
      updatePayload.completedAt = now;

      if (run.startedAt) {
        updatePayload.durationMs =
          now.getTime() - (run.startedAt as Date).getTime();
      }

      if (dto.progress === undefined) {
        updatePayload.progress = 100;
      }
    }

    const updated = await this.prisma.run.update({
      data: updatePayload as never,
      where: { id: runId },
    });

    if (!updated) {
      return null;
    }

    const events = this.buildLifecycleEvents(run, dto);

    let currentRun = updated as unknown as RunDocument;

    for (const event of events) {
      const withEvent = await this.appendEventForRun(
        runId,
        organizationId,
        event,
      );
      if (withEvent) {
        currentRun = withEvent;
      }
    }

    if (events.length > 0) {
      await this.fireMeteringHook(currentRun, RunMeteringStage.UPDATED);
    }

    return currentRun;
  }

  async appendEventForRun(
    runId: string,
    organizationId: string,
    event: AppendRunEventDto,
  ): Promise<RunDocument | null> {
    const run = await this.getRun(runId, organizationId);

    if (!run) {
      return null;
    }

    const eventToPersist: RunEvent = {
      ...event,
      createdAt: new Date(),
      traceId: event.traceId || run.traceId,
    };

    const existingEvents = (run.events ?? []) as RunEvent[];
    const updatedEvents = [...existingEvents, eventToPersist];

    const updated = await this.prisma.run.update({
      data: { events: updatedEvents as never },
      where: { id: runId },
    });

    if (updated) {
      const sequence = Math.max(updatedEvents.length - 1, 0);
      await this.publishEventEnvelope(
        updated as unknown as RunDocument,
        eventToPersist,
        sequence,
      );
    }

    return updated as unknown as RunDocument;
  }

  async getRunEvents(
    runId: string,
    organizationId: string,
  ): Promise<RunEventEnvelopeDto[] | null> {
    const run = await this.getRun(runId, organizationId);

    if (!run) {
      return null;
    }

    const sortedEvents = this.sortEvents(run.events || []);

    return sortedEvents.map((event, index) =>
      this.buildEventEnvelope(run, event, index),
    );
  }
}

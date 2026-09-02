import type {
  CredentialPlatform,
  PostCategory,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  CreateReleaseGroupInput,
  RecurrencePreviewInput,
  RecurrencePreviewResult,
  UpdateChannelTargetInput,
  UpdateRecurrenceSeriesInput,
  UpdateReleaseGroupInput,
} from '@genfeedai/contracts/api-types/contracts';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  IPaginatedResponse,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  extractCollection,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

/**
 * Calendar window plus its filters. `status` narrows the release; the remaining
 * filters are target-scoped, so a release stays in the result when *any* of its
 * channel targets matches.
 *
 * Array values are serialized as repeated query keys by
 * {@link HTTPBaseService}'s params serializer, which is the shape
 * `PostGroupsQueryDto` normalizes.
 */
export interface ReleaseGroupListQuery {
  brandId?: string;
  campaignId?: string;
  contentType?: PostCategory[];
  credentialId?: string[];
  endDate?: string;
  executionState?: TargetExecutionState[];
  limit?: number;
  page?: number;
  platform?: CredentialPlatform[];
  publicationState?: 'posted' | 'not-posted';
  search?: string;
  source?: ReleaseTargetSource[];
  sort?:
    | 'createdAt: -1'
    | 'createdAt: 1'
    | 'scheduledDate: -1'
    | 'scheduledDate: 1'
    | 'updatedAt: -1'
    | 'updatedAt: 1';
  startDate?: string;
  status?: ReleaseStatus[];
}

export class ReleaseGroupsService extends HTTPBaseService {
  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.POST_GROUPS}`,
      token,
    );
  }

  public static getInstance(token: string): ReleaseGroupsService {
    return HTTPBaseService.getBaseServiceInstance(
      ReleaseGroupsService,
      token,
    ) as ReleaseGroupsService;
  }

  async findAll(
    query: ReleaseGroupListQuery,
    signal?: AbortSignal,
  ): Promise<IReleaseGroup[]> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      params: query,
      signal,
    });

    return extractCollection<IReleaseGroup>(response.data);
  }

  async findAllPage(
    query: ReleaseGroupListQuery,
    signal?: AbortSignal,
  ): Promise<IPaginatedResponse<IReleaseGroup>> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      params: query,
      signal,
    });
    const items = extractCollection<IReleaseGroup>(response.data);
    const pagination = response.data.links?.pagination;
    const page = pagination?.page ?? query.page ?? 1;
    const pageSize = Math.max(
      1,
      pagination?.limit ?? query.limit ?? items.length,
    );
    const total = pagination?.total ?? items.length;
    const totalPages =
      pagination?.pages ?? Math.max(1, Math.ceil(total / pageSize));

    return {
      hasNext: page < totalPages,
      hasPrevious: page > 1,
      items,
      page,
      pageSize,
      total,
      totalPages,
    };
  }

  async findOne(releaseId: string): Promise<IReleaseGroup> {
    return this.getOne(releaseId);
  }

  async create(
    input: CreateReleaseGroupInput,
    signal?: AbortSignal,
  ): Promise<IReleaseGroup> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '',
      input,
      { signal },
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  async getOne(groupId: string, signal?: AbortSignal): Promise<IReleaseGroup> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/${groupId}`,
      { signal },
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  async preview(
    input: RecurrencePreviewInput,
    signal?: AbortSignal,
  ): Promise<RecurrencePreviewResult> {
    const response = await this.instance.post<RecurrencePreviewResult>(
      '/recurrence/preview',
      input,
      { signal },
    );
    return response.data;
  }

  async pauseFuture(groupId: string): Promise<IReleaseGroup> {
    return this.postSeriesAction(groupId, 'pause');
  }

  async resumeFuture(groupId: string): Promise<IReleaseGroup> {
    return this.postSeriesAction(groupId, 'resume');
  }

  async cancelFuture(groupId: string): Promise<IReleaseGroup> {
    return this.postSeriesAction(groupId, 'cancel-future');
  }

  async editFuture(
    groupId: string,
    input: UpdateRecurrenceSeriesInput,
  ): Promise<IReleaseGroup> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${groupId}/series/future`,
      input,
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  private async postSeriesAction(
    groupId: string,
    action: 'cancel-future' | 'pause' | 'resume',
  ): Promise<IReleaseGroup> {
    const patchAction =
      action === 'pause'
        ? 'series-pause'
        : action === 'resume'
          ? 'series-resume'
          : 'series-cancel-future';
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${groupId}`,
      { action: patchAction },
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  async pause(groupId: string): Promise<IReleaseGroup> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${groupId}`,
      { action: 'pause' },
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  async resume(groupId: string): Promise<IReleaseGroup> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${groupId}`,
      { action: 'resume' },
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  async cancel(groupId: string): Promise<IReleaseGroup> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${groupId}`,
      { action: 'cancel' },
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  /**
   * Partial edit of a release's shared fields — the release-level reschedule
   * path when `scheduledDate` is supplied.
   */
  async update(
    groupId: string,
    input: UpdateReleaseGroupInput,
  ): Promise<IReleaseGroup> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${groupId}`,
      input,
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  /**
   * Move a calendar card without enqueueing a publish. Used when the operator
   * chooses card-only after dragging a published or past-due queued item.
   */
  async moveCalendarPlacement(
    groupId: string,
    scheduledDate: string,
  ): Promise<IReleaseGroup> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${groupId}`,
      { action: 'calendar-move', scheduledDate },
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  /**
   * Publish again at the drop time through the existing release contract: a new
   * scheduled occurrence for live posts, or a reschedule for unpublished ones.
   */
  async republishAt(
    groupId: string,
    scheduledDate: string,
  ): Promise<IReleaseGroup> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${groupId}`,
      { action: 'republish', scheduledDate },
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  /**
   * Partial edit of a single channel target. Covers a per-target reschedule
   * (`scheduledDate`) and a manual retry of a failed target
   * (`executionState: scheduled`), which the API turns into a fresh publish
   * attempt rather than a bare column write.
   */
  async updateTarget(
    groupId: string,
    targetId: string,
    input: UpdateChannelTargetInput,
  ): Promise<IReleaseGroup> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${groupId}/targets/${targetId}`,
      input,
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  async publishNow(groupId: string): Promise<IReleaseGroup> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${groupId}`,
      { action: 'publish-now' },
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  async ensureFromPost(postId: string): Promise<IReleaseGroup> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/from-post',
      { postId },
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  async scheduleTarget(
    groupId: string,
    targetId: string,
    scheduledDate: string,
  ): Promise<IReleaseGroup> {
    return this.updateTarget(groupId, targetId, {
      action: 'schedule',
      scheduledDate,
    } as UpdateChannelTargetInput);
  }

  /**
   * Publish one target immediately. Sends no timestamp on purpose: the server
   * stamps its own clock, so client clock skew can neither trip the strict
   * future validator nor silently turn "Publish now" into a schedule.
   */
  async publishTargetNow(
    groupId: string,
    targetId: string,
  ): Promise<IReleaseGroup> {
    return this.updateTarget(groupId, targetId, {
      action: 'publish-now',
    } as UpdateChannelTargetInput);
  }

  async publishTargetViaTikTokApp(
    groupId: string,
    targetId: string,
  ): Promise<IReleaseGroup> {
    return this.updateTarget(groupId, targetId, {
      action: 'publish-via-tiktok-app',
    } as UpdateChannelTargetInput);
  }
}

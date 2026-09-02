import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  ICalendarSlot,
  ICalendarSlotBulkGenerateResult,
  IPostingCadence,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  extractCollection,
  extractResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export type CreatePostingCadenceInput = {
  brief?: string;
  brandId: string;
  credentialId: string;
  endsAt?: string;
  format: IPostingCadence['format'];
  generateLanding?: IPostingCadence['generateLanding'];
  intervalMinutes: number;
  label?: string;
  maxOccurrences?: number;
  startsAt: string;
  timezone?: string;
  windowEndMinute: number;
  windowStartMinute: number;
};

export type UpdatePostingCadenceInput = Partial<CreatePostingCadenceInput>;

export class PostingCadencesService extends HTTPBaseService {
  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.POSTING_CADENCES}`,
      token,
    );
  }

  public static getInstance(token: string): PostingCadencesService {
    return HTTPBaseService.getBaseServiceInstance(
      PostingCadencesService,
      token,
    ) as PostingCadencesService;
  }

  async create(input: CreatePostingCadenceInput): Promise<IPostingCadence> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '',
      input,
    );
    return extractResource<IPostingCadence>(response.data);
  }

  async list(
    brandId: string,
    signal?: AbortSignal,
  ): Promise<IPostingCadence[]> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      params: { brandId },
      signal,
    });
    return extractCollection<IPostingCadence>(response.data);
  }

  async listSlots(
    query: { brandId: string; endDate: string; startDate: string },
    signal?: AbortSignal,
  ): Promise<ICalendarSlot[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/slots',
      { params: query, signal },
    );
    return extractCollection<ICalendarSlot>(response.data);
  }

  async book(input: {
    brandId: string;
    credentialId: string;
    format: ICalendarSlot['format'];
    instant: string;
    timezone?: string;
  }): Promise<ICalendarSlot> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/slots/book',
      input,
    );
    return extractResource<ICalendarSlot>(response.data);
  }

  async generate(input: {
    brief?: string;
    identityKey: string;
  }): Promise<ICalendarSlot> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/slots/generate',
      input,
    );
    return extractResource<ICalendarSlot>(response.data);
  }

  async generateBulk(
    input: {
      brief?: string;
      confirmedCount: number;
      identityKeys: string[];
    },
    signal?: AbortSignal,
  ): Promise<ICalendarSlotBulkGenerateResult> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/slots/generate-bulk',
      input,
      {
        signal,
        timeout: 10 * 60 * 1000,
      },
    );
    return extractResource<ICalendarSlotBulkGenerateResult>(response.data);
  }

  async write(identityKey: string): Promise<ICalendarSlot> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/slots/write',
      { identityKey },
    );
    return extractResource<ICalendarSlot>(response.data);
  }

  async skip(identityKey: string): Promise<ICalendarSlot> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/slots/skip',
      { identityKey },
    );
    return extractResource<ICalendarSlot>(response.data);
  }

  async cancel(identityKey: string): Promise<ICalendarSlot> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/slots/cancel',
      { identityKey },
    );
    return extractResource<ICalendarSlot>(response.data);
  }

  async update(
    id: string,
    input: UpdatePostingCadenceInput,
  ): Promise<IPostingCadence> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${id}`,
      input,
    );
    return extractResource<IPostingCadence>(response.data);
  }

  async delete(id: string): Promise<IPostingCadence> {
    const response = await this.instance.delete<JsonApiResponseDocument>(
      `/${id}`,
    );
    return extractResource<IPostingCadence>(response.data);
  }
}

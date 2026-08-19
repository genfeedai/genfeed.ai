import { API_ENDPOINTS } from '@genfeedai/constants';
import type { ICalendarSlot, IPostingCadence } from '@genfeedai/interfaces';
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

  async write(identityKey: string): Promise<ICalendarSlot> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/slots/write',
      { identityKey },
    );
    return extractResource<ICalendarSlot>(response.data);
  }
}

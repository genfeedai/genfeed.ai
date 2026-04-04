import { type ApiResponse, apiRequest } from '@/services/api/base-http.service';

export interface IdeaAttributes {
  text: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Idea {
  id: string;
  type: 'idea';
  attributes: IdeaAttributes;
}

export type IdeasResponse = ApiResponse<Idea[]>;
export type IdeaResponse = ApiResponse<Idea>;

export interface CreateIdeaPayload {
  text: string;
  tags?: string[];
}

export interface UpdateIdeaPayload {
  text?: string;
  tags?: string[];
}

export interface IdeasQueryOptions {
  page?: number;
  pageSize?: number;
}

class IdeasService {
  findAll(token: string, options?: IdeasQueryOptions): Promise<IdeasResponse> {
    return apiRequest<IdeasResponse>(token, 'ideas', {
      params: {
        page: options?.page,
        pageSize: options?.pageSize,
      },
    });
  }

  findOne(token: string, id: string): Promise<IdeaResponse> {
    return apiRequest<IdeaResponse>(token, `ideas/${id}`);
  }

  create(token: string, payload: CreateIdeaPayload): Promise<IdeaResponse> {
    return apiRequest<IdeaResponse>(token, 'ideas', {
      body: { ...payload },
      method: 'POST',
    });
  }

  update(
    token: string,
    id: string,
    payload: UpdateIdeaPayload,
  ): Promise<IdeaResponse> {
    return apiRequest<IdeaResponse>(token, `ideas/${id}`, {
      body: { ...payload },
      method: 'PATCH',
    });
  }

  delete(token: string, id: string): Promise<void> {
    return apiRequest<void>(token, `ideas/${id}`, {
      method: 'DELETE',
    });
  }
}

export const ideasService = new IdeasService();

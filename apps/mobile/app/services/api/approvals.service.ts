import { type ApiResponse, apiRequest } from '@/services/api/base-http.service';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ContentType = 'image' | 'video' | 'article' | 'post';

export interface ApprovalAttributes {
  contentId: string;
  contentType: ContentType;
  status: ApprovalStatus;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  requestedBy: {
    id: string;
    name: string;
    email: string;
  };
  scheduledAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Approval {
  id: string;
  type: 'approval';
  attributes: ApprovalAttributes;
}

export type ApprovalsResponse = ApiResponse<Approval[]>;
export type ApprovalResponse = ApiResponse<Approval>;

export interface ApprovalActionPayload {
  reason?: string;
}

export interface ApprovalsQueryOptions {
  status?: ApprovalStatus;
  contentType?: ContentType;
  page?: number;
  pageSize?: number;
}

class ApprovalsService {
  findAll(
    token: string,
    options?: ApprovalsQueryOptions,
  ): Promise<ApprovalsResponse> {
    return apiRequest<ApprovalsResponse>(token, 'approvals', {
      params: {
        contentType: options?.contentType,
        page: options?.page,
        pageSize: options?.pageSize,
        status: options?.status,
      },
    });
  }

  findOne(token: string, id: string): Promise<ApprovalResponse> {
    return apiRequest<ApprovalResponse>(token, `approvals/${id}`);
  }

  approve(
    token: string,
    id: string,
    payload?: ApprovalActionPayload,
  ): Promise<ApprovalResponse> {
    return apiRequest<ApprovalResponse>(token, `approvals/${id}/approve`, {
      body: payload ? { ...payload } : {},
      method: 'POST',
    });
  }

  reject(
    token: string,
    id: string,
    payload: ApprovalActionPayload,
  ): Promise<ApprovalResponse> {
    return apiRequest<ApprovalResponse>(token, `approvals/${id}/reject`, {
      body: { ...payload },
      method: 'POST',
    });
  }

  bulkApprove(
    token: string,
    ids: string[],
  ): Promise<{ data: { approved: number; failed: number } }> {
    return apiRequest(token, 'approvals/bulk/approve', {
      body: { ids },
      method: 'POST',
    });
  }

  getCount(
    token: string,
    status?: ApprovalStatus,
  ): Promise<{ data: { count: number } }> {
    return apiRequest(token, 'approvals/count', {
      params: { status },
    });
  }
}

export const approvalsService = new ApprovalsService();

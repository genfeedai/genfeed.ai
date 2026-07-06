export interface AvatarResponse {
  id: string;
  name: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  gender?: string;
  style?: string;
  age?: string;
  status: 'processing' | 'completed' | 'failed';
  createdAt: string;
}

export interface AvatarListParams {
  limit?: number;
  offset?: number;
}

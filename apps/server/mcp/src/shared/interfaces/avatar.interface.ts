export interface AvatarCreationParams {
  name: string;
  gender?: 'male' | 'female' | 'neutral';
  style?: 'realistic' | 'cartoon' | 'professional' | 'casual';
  age?: 'young' | 'middle-aged' | 'senior';
}

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

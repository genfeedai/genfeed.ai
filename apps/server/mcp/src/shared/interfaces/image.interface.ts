export interface ImageCreationParams {
  prompt: string;
  style?:
    | 'realistic'
    | 'artistic'
    | 'abstract'
    | 'cartoon'
    | 'photographic'
    | 'digital-art';
  size?:
    | 'square'
    | 'portrait'
    | 'landscape'
    | '1024x1024'
    | '1792x1024'
    | '1024x1792';
  quality?: 'standard' | 'hd';
}

export interface ImageResponse {
  id: string;
  url: string;
  prompt: string;
  style: string;
  size: string;
  status: 'processing' | 'completed' | 'failed';
  createdAt: string;
}

export interface ImageListParams {
  limit?: number;
  offset?: number;
}

export interface GalleryItem {
  id: string;
  name: string;
  path: string;
  type: 'image' | 'video' | 'audio';
  size: number;
  mimeType: string;
  modifiedAt: string;
}

export type GalleryFilterType = 'all' | 'image' | 'video' | 'audio';

export interface GalleryResponse {
  items: GalleryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: { all: number; image: number; video: number; audio: number };
}

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'] as const;
export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'] as const;
export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'] as const;

export const MIME_TYPES: Record<string, string> = {
  '.aac': 'audio/aac',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
};

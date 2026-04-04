/**
 * Ghost Admin API interfaces
 */

export interface GhostTag {
  name: string;
  slug?: string;
}

export interface GhostPostPayload {
  title: string;
  html: string;
  status: 'draft' | 'published';
  feature_image?: string;
  tags?: GhostTag[];
}

export interface GhostPostResponse {
  id: string;
  uuid: string;
  title: string;
  slug: string;
  html: string;
  status: string;
  url: string;
  feature_image?: string;
  created_at: string;
  updated_at: string;
}

export interface GhostPostsApiResponse {
  posts: GhostPostResponse[];
}

export interface GhostImageUploadResponse {
  images: Array<{
    url: string;
    ref: string;
  }>;
}

export interface GhostSiteInfo {
  title: string;
  description: string;
  logo: string;
  icon: string;
  url: string;
  version: string;
}

export interface GhostSiteApiResponse {
  site: GhostSiteInfo;
}

export interface GhostConnectPayload {
  ghostUrl: string;
  apiKey: string;
  brand: string;
}

export interface GhostCreatePostPayload {
  ghostUrl: string;
  apiKey: string;
  title: string;
  html: string;
  status?: 'draft' | 'published';
  featureImage?: string;
  tags?: string[];
}

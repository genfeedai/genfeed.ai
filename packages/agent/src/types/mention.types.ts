export interface BrandMentionItem {
  id: string;
  brandName: string;
  brandSlug: string;
}

export interface TeamMentionItem {
  id: string;
  displayName: string;
  role: string;
  isAgent: boolean;
  avatar?: string;
}

export interface ContentMentionItem {
  id: string;
  contentTitle: string;
  contentType: string;
  thumbnailUrl?: string;
}

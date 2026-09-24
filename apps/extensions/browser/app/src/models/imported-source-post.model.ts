export const IMPORTED_POSTS_CHANGED = 'IMPORTED_POSTS_CHANGED';

export interface ImportedSourcePost {
  id: string;
  authorDisplayName: string | null;
  authorHandle: string | null;
  collectedAt: string | null;
  platform: string;
  sourceUrl: string | null;
  text: string | null;
}

export interface SocialPostImportOutcome {
  deduplicated: boolean;
  post: ImportedSourcePost;
}

export interface ImportedPostsPageProps {
  initialUrl?: string;
  onAddToKnowledge: (url: string) => void;
}

export interface ImportedPostSaveResponse {
  deduplicated?: boolean;
  error?: string;
  success?: boolean;
}

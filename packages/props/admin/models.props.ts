import type { PageScope } from '@genfeedai/contracts';

export interface ModelsListProps {
  category?: 'all' | 'image' | 'video' | 'music' | 'text' | 'other';
  scope?: PageScope;
}

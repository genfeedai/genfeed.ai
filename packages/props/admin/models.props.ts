import type { PageScope } from '@genfeedai/enums';

export interface ModelsListProps {
  category?: 'all' | 'image' | 'video' | 'music' | 'text' | 'other';
  scope?: PageScope;
}

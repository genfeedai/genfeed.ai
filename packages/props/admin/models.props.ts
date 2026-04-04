import type { PageScope } from '@ui-constants/misc.constant';

export interface ModelsListProps {
  category?: 'all' | 'image' | 'video' | 'music' | 'text' | 'other';
  scope?: PageScope;
}

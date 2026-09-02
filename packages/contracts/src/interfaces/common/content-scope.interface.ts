export type ContentScope =
  | 'superadmin'
  | 'organization'
  | 'brand'
  | 'analytics'
  | 'user'
  | 'publishing';

export interface ContentProps {
  scope: ContentScope;
}

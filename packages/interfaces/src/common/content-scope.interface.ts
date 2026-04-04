export type ContentScope =
  | 'superadmin'
  | 'organization'
  | 'brand'
  | 'analytics'
  | 'user'
  | 'publisher';

export interface ContentProps {
  scope: ContentScope;
}

export type PostsListSearchParams = Promise<{
  view?: string;
  account?: string | string[];
  contentType?: string | string[];
  executionState?: string | string[];
  page?: string;
  platform?: string;
  publicationState?: string;
  search?: string;
  sort?: string;
  status?: string;
}>;

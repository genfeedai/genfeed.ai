export type PostsListSearchParams = Promise<{
  view?: string;
  account?: string | string[];
  /** Legacy `?view=approvals` links: carried to /publishing/approvals. */
  approval?: string;
  filter?: string;
  item?: string;
  run?: string;
  contentType?: string | string[];
  executionState?: string | string[];
  page?: string;
  platform?: string;
  publicationState?: string;
  search?: string;
  sort?: string;
  source?: string;
  status?: string;
}>;

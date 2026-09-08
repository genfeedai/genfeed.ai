export interface PublishingContentEditorPageProps {
  contentId: string;
}

export type ContentLookup = {
  findOne: (
    id: string,
    query?: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<unknown>;
};

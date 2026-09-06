export interface AppBuildMetadata {
  readonly channel: string;
  readonly commitSha: string;
  readonly releaseTag: string | null;
  readonly version: string;
}

export interface PublishedRelease {
  tag: string;
  publishedAt: string;
  body: string;
  url: string;
}

export type ReleaseUpdateState =
  | { status: 'idle' | 'loading' | 'current' | 'error' }
  | { status: 'available'; tag: string; url: string };

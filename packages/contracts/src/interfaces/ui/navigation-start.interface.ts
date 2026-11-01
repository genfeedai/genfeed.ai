/**
 * A client router transition as announced by `onRouterTransitionStart`
 * (`apps/web/instrumentation-client.ts`). `url` is the destination href.
 */
export interface NavigationStartDetail {
  navigationType: 'push' | 'replace' | 'traverse';
  url: string;
}

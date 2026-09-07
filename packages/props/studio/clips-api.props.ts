import type {
  ClipLibraryLinkStatus,
  HookClipApprovalAction,
  HookClipApprovalStatus,
} from '@genfeedai/contracts/interfaces';

/**
 * Structural contract for the subset of `ClipsApiService` consumed by
 * studio/clips components. `ClipsApiService` `implements` this so drift
 * between the class and its callers is a type error.
 *
 * `ClipsApiService` lives app-local under
 * apps/app/app/(protected)/[orgSlug]/[brandSlug]/studio/clips/services —
 * not under packages/services — so its private response interfaces
 * (EditorHandoffResponse, PublishHandoffResponse, LibraryLinkResponse,
 * RewriteHighlightResponse) can't be imported here without an app -> props
 * dependency. Those members are widened to the equivalent inline shape.
 */
export interface ClipsApiClient {
  submitHookApproval(
    projectId: string,
    payload: { action: HookClipApprovalAction; feedback?: string },
  ): Promise<HookClipApprovalStatus>;
  createEditorHandoff(
    projectId: string,
    clipResultId: string,
  ): Promise<{
    editorPath: string;
    editorProjectId: string;
    videoUrl: string;
  }>;
  createPublishHandoff(
    projectId: string,
    clipResultId: string,
  ): Promise<{
    payload: {
      assets: Array<{
        assetId: string;
        caption?: string;
        mediaUrl: string;
        mimeType: string;
      }>;
      metadata?: {
        clipResultId?: string;
        ingredientId?: string;
        summary?: string | null;
        title?: string | null;
      };
    };
  }>;
  retryLibraryLink(
    projectId: string,
    clipResultId: string,
  ): Promise<{
    clipResultId: string;
    error?: string;
    ingredientId?: string;
    status: ClipLibraryLinkStatus;
  }>;
  rewriteHighlight(
    projectId: string,
    highlightId: string,
    payload: { platform: string; tone: string },
  ): Promise<{ rewrittenScript: string }>;
}

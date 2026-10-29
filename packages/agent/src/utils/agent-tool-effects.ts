import {
  LIBRARY_ASSETS_REFRESH_EVENT,
  PUBLISHING_CONTENT_REFRESH_EVENT,
} from '@genfeedai/contracts/constants';

/**
 * Agent tools that add or change Library assets. A run that completes one of
 * them tells the open Library to reload its grid and counts.
 */
const LIBRARY_ASSET_TOOLS: ReadonlySet<string> = new Set([
  'complete_media_upload',
  'ingest_source_media',
  'star_asset',
  'transform_media',
]);

/**
 * Agent tools that create or change Publishing content. A run that completes
 * one of them tells the open Publishing page to reload.
 */
const PUBLISHING_CONTENT_TOOLS: ReadonlySet<string> = new Set([
  'add_thread_posts',
  'create_post',
  'draft_thread',
  'publish_article',
  'record_external_publication',
  'repurpose_post',
  'schedule_post',
]);

interface AgentToolEffectCall {
  status: string;
  toolName: string;
}

/**
 * Turns the tools a run completed into `window` events the open page listens
 * for, so a page that shows what the agent changed reloads without a refresh.
 * A tool that failed changed nothing and sends no event.
 */
export function dispatchAgentToolEffects(
  toolCalls: readonly AgentToolEffectCall[] | undefined,
): void {
  if (typeof window === 'undefined' || !toolCalls?.length) {
    return;
  }

  const completedTools = new Set(
    toolCalls
      .filter((toolCall) => toolCall.status === 'completed')
      .map((toolCall) => toolCall.toolName),
  );
  const isChanged = (tools: ReadonlySet<string>): boolean =>
    [...completedTools].some((toolName) => tools.has(toolName));

  if (isChanged(PUBLISHING_CONTENT_TOOLS)) {
    window.dispatchEvent(new Event(PUBLISHING_CONTENT_REFRESH_EVENT));
  }
  if (isChanged(LIBRARY_ASSET_TOOLS)) {
    window.dispatchEvent(new Event(LIBRARY_ASSETS_REFRESH_EVENT));
  }
}

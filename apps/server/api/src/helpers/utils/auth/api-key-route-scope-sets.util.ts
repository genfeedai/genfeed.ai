import { ApiKeyScope } from '@genfeedai/contracts';

/**
 * Scopes for a route that generates content for a brand and spends credits:
 * storyboards, content runs, content plans, optimization and turbo runs. Any
 * scope that creates content opens it; a key that can only read, or that can
 * only edit a brand, cannot start a generation.
 */
export const API_KEY_CONTENT_GENERATION_SCOPES = [
  ApiKeyScope.VIDEOS_CREATE,
  ApiKeyScope.IMAGES_CREATE,
  ApiKeyScope.PROMPTS_CREATE,
  ApiKeyScope.ARTICLES_CREATE,
  ApiKeyScope.POSTS_DRAFT,
  ApiKeyScope.ADMIN,
] as const;

/**
 * Scopes for a route that changes what a brand knows about itself: its
 * interview, memory, imported sources and positioning. `brand-kit:write` is
 * the scope an MCP grant carries for the one brand chosen at consent.
 */
export const API_KEY_BRAND_EDIT_SCOPES = [
  ApiKeyScope.BRANDS_WRITE,
  ApiKeyScope.BRAND_KIT_WRITE,
  ApiKeyScope.ADMIN,
] as const;

/**
 * Scopes for a route that creates, changes or removes a Library asset. An
 * MCP grant carries `images:create` and `videos:create` but no update or delete
 * scope, and its `delete_asset` tool calls `DELETE /ingredients/:id`, so every
 * media write scope opens every media route.
 */
export const API_KEY_MEDIA_WRITE_SCOPES = [
  ApiKeyScope.IMAGES_CREATE,
  ApiKeyScope.IMAGES_UPDATE,
  ApiKeyScope.IMAGES_DELETE,
  ApiKeyScope.VIDEOS_CREATE,
  ApiKeyScope.VIDEOS_UPDATE,
  ApiKeyScope.VIDEOS_DELETE,
  ApiKeyScope.ADMIN,
] as const;

/**
 * Scopes for the approval routes the Genfeed MCP server calls around a write
 * tool: queuing an action, answering it in the client, claiming it and
 * recording its result. Any scope an MCP grant can carry for a write opens
 * them, so a key that can run a write tool can also ask for its approval.
 */
export const API_KEY_MCP_ACTION_SCOPES = [
  ...API_KEY_CONTENT_GENERATION_SCOPES,
  ApiKeyScope.BRANDS_WRITE,
  ApiKeyScope.BRAND_KIT_WRITE,
  ApiKeyScope.POSTS_SCHEDULE,
  ApiKeyScope.POSTS_APPROVE,
  ApiKeyScope.POSTS_PUBLISH,
] as const;

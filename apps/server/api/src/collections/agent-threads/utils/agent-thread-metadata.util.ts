import type { AgentThreadMode } from '@genfeedai/contracts';

export interface AgentThreadMetadataBody {
  isPinned?: boolean;
  memoryEntryIds?: string[];
  mode?: AgentThreadMode;
  requestedModel?: string;
  runtimeKey?: string;
  systemPrompt?: string;
  title?: string;
}

/**
 * The fields a client may change through the metadata PATCH. Anything else in
 * the body (`kind`, `parentThreadId`, `isDeleted`, ...) is dropped so a client
 * cannot rewrite a column the API owns, e.g. demote the master and archive it.
 */
export function pickAgentThreadMetadata(
  body: AgentThreadMetadataBody,
): AgentThreadMetadataBody {
  const picked: AgentThreadMetadataBody = {};
  if (body.isPinned !== undefined) picked.isPinned = body.isPinned;
  if (body.memoryEntryIds !== undefined) {
    picked.memoryEntryIds = body.memoryEntryIds;
  }
  if (body.mode !== undefined) picked.mode = body.mode;
  if (body.requestedModel !== undefined) {
    picked.requestedModel = body.requestedModel;
  }
  if (body.runtimeKey !== undefined) picked.runtimeKey = body.runtimeKey;
  if (body.systemPrompt !== undefined) picked.systemPrompt = body.systemPrompt;
  if (body.title !== undefined) picked.title = body.title;
  return picked;
}

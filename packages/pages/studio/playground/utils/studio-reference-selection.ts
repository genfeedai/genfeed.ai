import type { AgentContentMentionItem } from '@genfeedai/contracts/interfaces';
import type {
  StudioGenerateDraftReference,
  StudioPlaygroundReferenceRole,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';

export function getStudioReferenceKind(
  contentType: string,
): 'image' | 'video' | 'audio' {
  const type = contentType.toLowerCase();
  if (['audio', 'voice', 'music'].some((kind) => type.includes(kind)))
    return 'audio';
  return type.includes('video') ? 'video' : 'image';
}

export function filterStudioReferenceLibrary(
  items: readonly AgentContentMentionItem[],
  role: StudioPlaygroundReferenceRole,
): AgentContentMentionItem[] {
  return items.filter((item) => {
    const kind = getStudioReferenceKind(item.contentType);
    if (role === 'audioReference') return kind === 'audio';
    return (
      Boolean(item.thumbnailUrl) &&
      kind === (role === 'videoReference' ? 'video' : 'image')
    );
  });
}

export function resolveStudioUploadReferenceRole(
  kind: 'image' | 'video' | 'audio',
  type: StudioPlaygroundType,
  explicitRole?: StudioPlaygroundReferenceRole,
): StudioPlaygroundReferenceRole {
  if (explicitRole) return explicitRole;
  if (kind === 'audio') return 'audioReference';
  if (type === 'video')
    return kind === 'video' ? 'videoReference' : 'startFrame';
  return type === 'image-edit' ? 'editSource' : 'reference';
}

export function studioAudioReferenceIds(
  entries: readonly StudioGenerateDraftReference[],
): string[] {
  return entries
    .filter((entry) => entry.role === 'audioReference')
    .map((entry) => entry.id);
}

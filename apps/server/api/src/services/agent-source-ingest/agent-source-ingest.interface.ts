export interface AgentSourceIngestInput {
  url?: string;
  ingredientId?: string;
  title?: string;
  kind?: 'video' | 'image' | 'audio';
}
export interface AgentSourceIngestContext {
  organizationId: string;
  brandId?: string;
  userId: string;
  threadId: string;
}
export interface AgentSourceArtifact {
  publicUrl: string;
  storageKey: string;
  kind: 'video' | 'image' | 'audio';
  extension:
    | 'JPEG'
    | 'PNG'
    | 'GIF'
    | 'WEBP'
    | 'MP4'
    | 'WEBM'
    | 'MOV'
    | 'MP3'
    | 'WAV';
  width: number;
  height: number;
  duration: number;
  size: number;
  hasAudio: boolean;
}

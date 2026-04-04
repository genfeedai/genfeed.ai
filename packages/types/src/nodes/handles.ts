// =============================================================================
// HANDLE TYPES
// =============================================================================

export enum HandleTypeEnum {
  IMAGE = 'image',
  TEXT = 'text',
  VIDEO = 'video',
  NUMBER = 'number',
  AUDIO = 'audio',
}

export type HandleType = `${HandleTypeEnum}`;

export interface HandleDefinition {
  id: string;
  type: HandleType;
  label: string;
  multiple?: boolean;
  required?: boolean;
  /** True if handle was dynamically generated from model schema */
  fromSchema?: boolean;
}

// Connection validation rules
export const CONNECTION_RULES: Record<HandleType, HandleType[]> = {
  audio: ['audio'],
  image: ['image'],
  number: ['number'],
  text: ['text'],
  video: ['video'],
};

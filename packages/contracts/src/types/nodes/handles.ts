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

/**
 * Handle definition loosened for presentation. Widens `type` from the
 * {@link HandleType} enum to a plain string so render-only handle types (e.g.
 * `'text[]'`) and SaaS nodes outside the canonical registry can be described,
 * and adds the `optional` presentation alias used by SaaS node definitions.
 * Used by BaseNode and SaaSNode; canonical node data still uses HandleDefinition.
 */
export interface VisualHandleDefinition extends Omit<HandleDefinition, 'type'> {
  type: string;
  optional?: boolean;
}

// Connection validation rules
export const CONNECTION_RULES: Record<HandleType, HandleType[]> = {
  audio: ['audio'],
  image: ['image'],
  number: ['number'],
  text: ['text'],
  video: ['video'],
};

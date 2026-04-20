export type {
  AgentMemory,
  AgentMemory as AgentMemoryDocument,
} from '@genfeedai/prisma';

export const AGENT_MEMORY_KINDS = [
  'preference',
  'positive_example',
  'negative_example',
  'winner',
  'reference',
  'instruction',
  'pattern',
] as const;

export const AGENT_MEMORY_SCOPES = ['user', 'brand', 'campaign'] as const;

export const AGENT_MEMORY_CONTENT_TYPES = [
  'newsletter',
  'tweet',
  'thread',
  'article',
  'post',
  'generic',
] as const;

export type AgentMemoryKind = (typeof AGENT_MEMORY_KINDS)[number];
export type AgentMemoryScope = (typeof AGENT_MEMORY_SCOPES)[number];
export type AgentMemoryContentType =
  (typeof AGENT_MEMORY_CONTENT_TYPES)[number];

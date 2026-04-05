import type { WorkflowEdge, WorkflowNode } from '@genfeedai/types';
import { NODE_DEFINITIONS } from '@genfeedai/types';

/**
 * Binary fields by node type - fields containing base64 data URLs or large media
 */
const BINARY_FIELDS_BY_TYPE: Record<string, string[]> = {
  animation: ['inputVideo', 'outputVideo'],
  annotation: ['inputImage', 'outputImage'],
  imageCompare: ['imageA', 'imageB'],
  imageGen: ['inputImages', 'outputImage', 'outputImages'],
  imageGridSplit: ['inputImage', 'outputImages'],
  imageInput: ['image'],
  lipSync: ['inputImage', 'inputVideo', 'inputAudio', 'outputVideo'],
  llm: ['inputImages'],
  motionControl: ['inputImage', 'inputVideo', 'outputVideo'],
  output: ['inputImage', 'inputVideo'],
  outputGallery: ['images'],
  prompt: [],
  promptConstructor: [],
  reframe: ['inputImage', 'inputVideo', 'outputImage', 'outputVideo'],
  resize: ['inputMedia', 'outputMedia'],
  subtitle: ['inputVideo', 'outputVideo'],
  template: [],
  textToSpeech: ['outputAudio'],
  upscale: [
    'inputImage',
    'inputVideo',
    'outputImage',
    'outputVideo',
    'originalPreview',
    'outputPreview',
  ],
  videoFrameExtract: ['inputVideo', 'outputImage'],
  videoGen: ['inputImage', 'lastFrame', 'referenceImages', 'outputVideo'],
  videoStitch: ['inputVideos', 'outputVideo'],
  videoTrim: ['inputVideo', 'outputVideo'],
  voiceChange: ['inputVideo', 'inputAudio', 'outputVideo'],
};

/**
 * Fields to strip completely (irrelevant for editing context)
 */
const STRIP_FIELDS = ['cachedOutput', 'lockTimestamp', 'jobId', 'progress'];

/**
 * Stripped node with binary data replaced by metadata placeholders
 */
export interface StrippedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

/**
 * Lightweight workflow context for LLM consumption.
 */
export interface WorkflowContext {
  nodeCount: number;
  nodes: StrippedNode[];
  connections: Array<{
    from: string;
    to: string;
    sourceHandle: string | null;
    targetHandle: string | null;
  }>;
  isEmpty: boolean;
}

/**
 * Formats a binary field placeholder with metadata.
 */
function formatBinaryPlaceholder(value: string | string[], fieldName: string): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[no media]';
    return `[${value.length} item(s)]`;
  }

  const isUrl = value.startsWith('http://') || value.startsWith('https://');
  const isVideo = fieldName.toLowerCase().includes('video');
  const type = isVideo ? 'video' : 'image';

  if (isUrl) {
    return `[${type}: URL]`;
  }

  // Base64 size estimation
  const sizeKB = Math.round((value.length * 3) / 4 / 1024);
  return `[${type}: ${sizeKB}KB]`;
}

/**
 * Strips binary data from workflow nodes, preserving all parameters
 * and adding metadata placeholders.
 */
export function stripBinaryData(nodes: WorkflowNode[]): StrippedNode[] {
  return nodes.map((node) => {
    const strippedData: Record<string, unknown> = {};
    const binaryFields = BINARY_FIELDS_BY_TYPE[node.type ?? ''] || [];

    for (const [key, value] of Object.entries(node.data)) {
      if (STRIP_FIELDS.includes(key)) continue;

      if (binaryFields.includes(key)) {
        if (value === null || value === undefined) {
          strippedData[key] = value;
        } else {
          strippedData[key] = formatBinaryPlaceholder(value as string | string[], key);
        }
      } else {
        strippedData[key] = value;
      }
    }

    return {
      data: strippedData,
      id: node.id,
      position: node.position,
      type: node.type ?? 'unknown',
    };
  });
}

/**
 * Builds a lightweight workflow context from nodes and edges.
 */
export function buildWorkflowContext(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): WorkflowContext {
  const isEmpty = nodes.length === 0;
  const strippedNodes = stripBinaryData(nodes);

  const connections = edges.map((edge) => ({
    from: edge.source,
    sourceHandle: edge.sourceHandle || null,
    targetHandle: edge.targetHandle || null,
    to: edge.target,
  }));

  return {
    connections,
    isEmpty,
    nodeCount: nodes.length,
    nodes: strippedNodes,
  };
}

/**
 * Formats workflow context as a readable string for injection into LLM system prompt.
 */
export function formatContextForPrompt(context: WorkflowContext): string {
  if (context.isEmpty) {
    return 'The canvas is currently empty.';
  }

  const lines: string[] = [];

  lines.push(`Current workflow has ${context.nodeCount} node(s):`);
  for (const node of context.nodes) {
    const def = NODE_DEFINITIONS[node.type as keyof typeof NODE_DEFINITIONS];
    const title = (node.data.label as string) || def?.label || node.type;
    lines.push(`  - ${node.id}: ${title} (${node.type})`);
  }

  if (context.connections.length > 0) {
    lines.push('');
    lines.push('Connections:');
    for (const conn of context.connections) {
      const handleInfo = conn.sourceHandle ? ` (${conn.sourceHandle})` : '';
      lines.push(`  - ${conn.from} → ${conn.to}${handleInfo}`);
    }
  }

  return lines.join('\n');
}

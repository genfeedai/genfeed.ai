import { UNIFIED_NODE_REGISTRY as NODE_REGISTRY } from '@api/collections/workflows/registry/node-registry-adapter';
import { Injectable } from '@nestjs/common';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Core workflow format — the modern React Flow-based format used in
 * @genfeedai/workflow-ui and packages/workflow-saas
 */
export interface CoreWorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface CoreWorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface CoreWorkflowFormat {
  name?: string;
  description?: string;
  nodes: CoreWorkflowNode[];
  edges: CoreWorkflowEdge[];
  version?: number;
}

/**
 * Cloud workflow format stored in MongoDB.
 *
 * Historically this used legacy kebab-case node types, but the repo now
 * tolerates a mixed cloud format while the naming cleanup is in progress.
 */
export interface CloudWorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    config?: Record<string, unknown>;
    inputVariableKeys?: string[];
  };
}

export interface CloudWorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface CloudWorkflowFormat {
  name?: string;
  description?: string;
  nodes: CloudWorkflowNode[];
  edges: CloudWorkflowEdge[];
}

export type WorkflowSourceFormat = 'core' | 'cloud';

export interface ConversionResult {
  workflow: CloudWorkflowFormat;
  warnings: string[];
  unmappedNodeTypes: string[];
}

// =============================================================================
// FORMAT DETECTION
// =============================================================================

/**
 * Detect whether a workflow JSON is in core or cloud format.
 *
 * Core format: node types are camelCase editor/executor names
 *   (e.g., "imageGen", "brandContext")
 * Cloud format: node types map to the workflow registry, including legacy aliases
 *   (e.g., "ai-generate-image", "workflow-input")
 */
export function detectFormat(
  workflow: CoreWorkflowFormat | CloudWorkflowFormat,
): WorkflowSourceFormat {
  const nodeTypes = (workflow.nodes || []).map((n) => n.type);

  if (nodeTypes.length === 0) {
    return 'cloud';
  }

  const hasKebabCase = nodeTypes.some((t) => t.includes('-'));
  const hasCamelCase = nodeTypes.some((t) => /^[a-z]+[A-Z]/.test(t));

  if (hasKebabCase && !hasCamelCase) {
    return 'cloud';
  }

  if (hasCamelCase && !hasKebabCase) {
    return 'core';
  }

  // If the nodes match entries in NODE_REGISTRY, it's cloud format
  const matchesRegistry = nodeTypes.some((t) => t in NODE_REGISTRY);
  return matchesRegistry ? 'cloud' : 'core';
}

// =============================================================================
// NODE TYPE MAPPING
// =============================================================================

/**
 * Maps core node types (camelCase) to legacy cloud node types.
 * We still serialize the legacy cloud spellings here to preserve compatibility
 * with existing persisted workflows and backend execution paths.
 */
const CORE_TO_CLOUD_NODE_TYPE: Record<string, string> = {
  beatAnalysis: 'process-extract-audio',
  brand: 'input-template',
  brandAsset: 'input-image',
  brandContext: 'input-template',
  captionGen: 'effect-captions',
  colorGrade: 'effect-color-grade',
  condition: 'control-branch',
  delay: 'control-delay',
  imageGen: 'ai-generate-image',
  platformExport: 'output-export',
  promptConstructor: 'ai-prompt-constructor',
  publish: 'output-publish',
  videoInput: 'input-video',
  workflowInput: 'workflow-input',
  workflowOutput: 'workflow-output',
};

/**
 * Maps cloud node types (kebab-case) back to core executor types (camelCase).
 * This is the inverse of NODE_TYPE_TO_EXECUTOR in the adapter service.
 */
const CLOUD_TO_CORE_NODE_TYPE: Record<string, string> = {
  'ai-enhance': 'aiEnhance',
  'ai-generate-image': 'imageGen',
  'ai-generate-video': 'aiGenerateVideo',
  'ai-prompt-constructor': 'promptConstructor',
  'ai-transcribe': 'transcribe',
  'ai-upscale': 'upscale',
  'control-branch': 'condition',
  'control-delay': 'delay',
  'control-loop': 'loop',
  'effect-captions': 'captionGen',
  'effect-color-grade': 'colorGrade',
  'effect-ken-burns': 'kenBurns',
  'effect-portrait-blur': 'portraitBlur',
  'effect-split-screen': 'splitScreen',
  'effect-text-overlay': 'textOverlay',
  'effect-watermark': 'watermark',
  'input-image': 'imageInput',
  'input-prompt': 'promptInput',
  'input-template': 'templateInput',
  'input-video': 'videoInput',
  'output-export': 'export',
  'output-notify': 'notify',
  'output-publish': 'publish',
  'output-save': 'save',
  'output-webhook': 'webhook',
  'process-compress': 'compress',
  'process-extract-audio': 'extractAudio',
  'process-merge-videos': 'mergeVideos',
  'process-mirror': 'mirror',
  'process-resize': 'resize',
  'process-reverse': 'reverse',
  'process-transform': 'transform',
  'process-trim': 'trim',
  'workflow-input': 'workflowInput',
  'workflow-output': 'workflowOutput',
};

// =============================================================================
// SERVICE
// =============================================================================

@Injectable()
export class WorkflowFormatConverterService {
  /**
   * Convert a core-format workflow to cloud format.
   * Handles node type mapping, handle format conversion, and config schema translation.
   */
  convertCoreToCloud(workflow: CoreWorkflowFormat): ConversionResult {
    const warnings: string[] = [];
    const unmappedNodeTypes: string[] = [];

    const nodes: CloudWorkflowNode[] = workflow.nodes.map((node) => {
      const cloudType =
        CORE_TO_CLOUD_NODE_TYPE[node.type] ?? this.camelToKebab(node.type);

      if (
        !CORE_TO_CLOUD_NODE_TYPE[node.type] &&
        !(cloudType in NODE_REGISTRY)
      ) {
        unmappedNodeTypes.push(node.type);
        warnings.push(
          `Node type "${node.type}" has no cloud equivalent; using "${cloudType}"`,
        );
      }

      const registryDef = NODE_REGISTRY[cloudType];
      const label =
        (node.data?.label as string) ?? registryDef?.label ?? node.type;

      const config = this.extractConfig(node.data);

      return {
        data: {
          config,
          label,
        },
        id: node.id,
        position: node.position,
        type: cloudType,
      };
    });

    const edges: CloudWorkflowEdge[] = workflow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
    }));

    return {
      unmappedNodeTypes,
      warnings,
      workflow: {
        description: workflow.description,
        edges,
        name: workflow.name,
        nodes,
      },
    };
  }

  /**
   * Convert a cloud-format workflow to core format.
   */
  convertCloudToCore(workflow: CloudWorkflowFormat): {
    workflow: CoreWorkflowFormat;
    warnings: string[];
  } {
    const warnings: string[] = [];

    const nodes: CoreWorkflowNode[] = workflow.nodes.map((node) => {
      const coreType = CLOUD_TO_CORE_NODE_TYPE[node.type] ?? node.type;

      if (!CLOUD_TO_CORE_NODE_TYPE[node.type]) {
        warnings.push(
          `Cloud node type "${node.type}" has no core equivalent; passing through`,
        );
      }

      return {
        data: {
          label: node.data.label,
          status: 'idle',
          ...(node.data.config ?? {}),
        },
        id: node.id,
        position: node.position,
        type: coreType,
      };
    });

    const edges: CoreWorkflowEdge[] = workflow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
    }));

    return {
      warnings,
      workflow: {
        description: workflow.description,
        edges,
        name: workflow.name,
        nodes,
        version: 1,
      },
    };
  }

  /**
   * Auto-detect format and convert to cloud format if needed.
   */
  ensureCloudFormat(
    workflow: CoreWorkflowFormat | CloudWorkflowFormat,
  ): ConversionResult {
    const format = detectFormat(workflow);

    if (format === 'cloud') {
      return {
        unmappedNodeTypes: [],
        warnings: [],
        workflow: workflow as CloudWorkflowFormat,
      };
    }

    return this.convertCoreToCloud(workflow as CoreWorkflowFormat);
  }

  /**
   * Extract config from core node data, filtering out non-config fields.
   */
  private extractConfig(
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const nonConfigFields = new Set([
      'label',
      'status',
      'error',
      'progress',
      'isLocked',
      'cachedOutput',
      'lockTimestamp',
      'comment',
      'color',
    ]);

    const config: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!nonConfigFields.has(key) && value !== undefined) {
        config[key] = value;
      }
    }

    return config;
  }

  /**
   * Convert camelCase to kebab-case as fallback when no explicit mapping exists.
   */
  private camelToKebab(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }
}

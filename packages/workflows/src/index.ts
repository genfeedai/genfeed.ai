export * from './contracts';
export * from './extensions/registry';
export * from './extensions/types';

/**
 * Workflow Registry for @genfeedai/workflows
 *
 * This registry contains metadata for all official workflow templates.
 * The actual workflow JSON files are stored in the `workflows/` directory.
 */

export * from './comfyui/index';

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WorkflowEdge, WorkflowNode } from '@genfeedai/types';

export interface WorkflowJson {
  version: number;
  name: string;
  description: string;
  edgeStyle: string;
  createdAt: string;
  updatedAt: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowMetadata {
  slug: string;
  title: string;
  description: string;
  category: 'image-generation' | 'video-generation' | 'full-pipeline';
  tags: string[];
  tier: 'free' | 'paid' | 'premium';
  icon: string;
  defaultModel: string;
  inputTypes: string[];
  outputTypes: string[];
  version: number;
}

/**
 * Registry of all available workflow templates
 */
export const WORKFLOW_REGISTRY: Record<string, WorkflowMetadata> = {
  'full-pipeline': {
    category: 'full-pipeline',
    defaultModel: 'nano-banana-pro',
    description:
      'Complete end-to-end workflow: concept development to final video production',
    icon: '⚡',
    inputTypes: ['text'],
    outputTypes: ['video'],
    slug: 'full-pipeline',
    tags: ['pipeline', 'advanced', 'complete', 'automation', 'production'],
    tier: 'free',
    title: 'Full Content Pipeline',
    version: 1,
  },
  'image-series': {
    category: 'image-generation',
    defaultModel: 'nano-banana-pro',
    description:
      'Generate a series of related images from a concept using LLM-powered prompt expansion',
    icon: '📸',
    inputTypes: ['text'],
    outputTypes: ['image'],
    slug: 'image-series',
    tags: ['image', 'series', 'llm', 'batch', 'automation'],
    tier: 'free',
    title: 'Image Series Generation',
    version: 1,
  },
  'image-to-video': {
    category: 'video-generation',
    defaultModel: 'nano-banana-pro',
    description:
      'Create smooth interpolated video transitions between two images with easing effects',
    icon: '🎞️',
    inputTypes: ['image'],
    outputTypes: ['video'],
    slug: 'image-to-video',
    tags: ['video', 'interpolation', 'animation', 'transition'],
    tier: 'free',
    title: 'Image to Video Transition',
    version: 1,
  },
  'single-image': {
    category: 'image-generation',
    defaultModel: 'nano-banana-pro',
    description:
      'Generate an AI image from a source image (img2img) with enhanced styling',
    icon: '🖼️',
    inputTypes: ['image', 'text'],
    outputTypes: ['image'],
    slug: 'single-image',
    tags: ['image', 'simple', 'img2img', 'enhancement'],
    tier: 'free',
    title: 'Single Image Generation',
    version: 1,
  },
  'single-video': {
    category: 'video-generation',
    defaultModel: 'nano-banana-pro',
    description:
      'Generate an AI video from a source image (img2video) with motion effects',
    icon: '🎬',
    inputTypes: ['image', 'text'],
    outputTypes: ['video'],
    slug: 'single-video',
    tags: ['video', 'simple', 'img2video', 'animation'],
    tier: 'free',
    title: 'Single Video Generation',
    version: 1,
  },
  'ugc-factory': {
    category: 'full-pipeline',
    defaultModel: 'nano-banana-pro',
    description: 'UGC pipeline: script → voice → motion → lip sync → download',
    icon: '🏭',
    inputTypes: ['text'],
    outputTypes: ['video'],
    slug: 'ugc-factory',
    tags: ['ugc', 'social', 'automation', 'marketing', 'content'],
    tier: 'free',
    title: 'UGC Content Factory',
    version: 1,
  },
};

/**
 * Get all workflows
 */
export function getAllWorkflows(): WorkflowMetadata[] {
  return Object.values(WORKFLOW_REGISTRY);
}

/**
 * Get workflow metadata by slug
 */
export function getWorkflow(slug: string): WorkflowMetadata | undefined {
  return WORKFLOW_REGISTRY[slug];
}

/**
 * Get workflow JSON by slug
 */
export function getWorkflowJson(slug: string): WorkflowJson | undefined {
  try {
    const workflowPath = path.join(
      __dirname,
      '..',
      'workflows',
      `${slug}.json`,
    );
    const jsonContent = fs.readFileSync(workflowPath, 'utf-8');
    return JSON.parse(jsonContent);
  } catch (_error) {
    return undefined;
  }
}

/**
 * Get all workflow IDs (legacy compatibility)
 */
export function getWorkflowIds(): string[] {
  return Object.keys(WORKFLOW_REGISTRY);
}

/**
 * Get workflow metadata by ID (legacy compatibility)
 */
export function getWorkflowMetadata(id: string): WorkflowMetadata | undefined {
  return WORKFLOW_REGISTRY[id];
}

/**
 * Get workflows by category
 */
export function getWorkflowsByCategory(
  category: WorkflowMetadata['category'],
): WorkflowMetadata[] {
  return Object.values(WORKFLOW_REGISTRY).filter(
    (w) => w.category === category,
  );
}

/**
 * Search workflows by tag
 */
export function searchWorkflowsByTag(tag: string): WorkflowMetadata[] {
  return Object.values(WORKFLOW_REGISTRY).filter((w) =>
    w.tags.some((t) => t.toLowerCase().includes(tag.toLowerCase())),
  );
}

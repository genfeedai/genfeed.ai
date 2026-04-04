import { describe, expect, test } from 'bun:test';
import {
  getAllWorkflows,
  getWorkflow,
  getWorkflowIds,
  getWorkflowMetadata,
  getWorkflowsByCategory,
  searchWorkflowsByTag,
  WORKFLOW_REGISTRY,
} from '../src/index';

describe('Workflow Registry', () => {
  test('should export all required workflows', () => {
    const expectedWorkflows = [
      'single-image',
      'single-video',
      'image-series',
      'image-to-video',
      'full-pipeline',
      'ugc-factory',
    ];

    const workflowIds = getWorkflowIds();
    expectedWorkflows.forEach((id) => {
      expect(workflowIds).toContain(id);
    });
  });

  test('getAllWorkflows should return all workflow metadata', () => {
    const workflows = getAllWorkflows();
    expect(workflows).toHaveLength(6);

    workflows.forEach((workflow) => {
      expect(workflow).toHaveProperty('slug');
      expect(workflow).toHaveProperty('title');
      expect(workflow).toHaveProperty('description');
      expect(workflow).toHaveProperty('category');
      expect(workflow).toHaveProperty('tags');
      expect(workflow).toHaveProperty('tier');
      expect(workflow).toHaveProperty('icon');
      expect(workflow).toHaveProperty('defaultModel');
      expect(workflow).toHaveProperty('inputTypes');
      expect(workflow).toHaveProperty('outputTypes');
      expect(workflow.tier).toBe('free');
    });
  });

  test('getWorkflow should return workflow by slug', () => {
    const workflow = getWorkflow('single-image');
    expect(workflow).toBeDefined();
    expect(workflow?.slug).toBe('single-image');
    expect(workflow?.title).toBe('Single Image Generation');
    expect(workflow?.category).toBe('image-generation');

    const nonExistent = getWorkflow('non-existent');
    expect(nonExistent).toBeUndefined();
  });

  test('getWorkflowMetadata should work for legacy compatibility', () => {
    const workflow = getWorkflowMetadata('single-image');
    expect(workflow).toBeDefined();
    expect(workflow?.slug).toBe('single-image');
  });

  test('getWorkflowsByCategory should filter workflows correctly', () => {
    const imageWorkflows = getWorkflowsByCategory('image-generation');
    expect(imageWorkflows.length).toBeGreaterThan(0);
    imageWorkflows.forEach((workflow) => {
      expect(workflow.category).toBe('image-generation');
    });

    const videoWorkflows = getWorkflowsByCategory('video-generation');
    expect(videoWorkflows.length).toBeGreaterThan(0);
    videoWorkflows.forEach((workflow) => {
      expect(workflow.category).toBe('video-generation');
    });

    const pipelineWorkflows = getWorkflowsByCategory('full-pipeline');
    expect(pipelineWorkflows.length).toBeGreaterThan(0);
    pipelineWorkflows.forEach((workflow) => {
      expect(workflow.category).toBe('full-pipeline');
    });
  });

  test('searchWorkflowsByTag should find workflows by tag', () => {
    const imageWorkflows = searchWorkflowsByTag('image');
    expect(imageWorkflows.length).toBeGreaterThan(0);
    imageWorkflows.forEach((workflow) => {
      expect(
        workflow.tags.some((tag) => tag.toLowerCase().includes('image')),
      ).toBe(true);
    });

    const videoWorkflows = searchWorkflowsByTag('video');
    expect(videoWorkflows.length).toBeGreaterThan(0);
    videoWorkflows.forEach((workflow) => {
      expect(
        workflow.tags.some((tag) => tag.toLowerCase().includes('video')),
      ).toBe(true);
    });

    const nonExistent = searchWorkflowsByTag('nonexistent');
    expect(nonExistent).toHaveLength(0);
  });

  test('registry should have correct marketplace metadata format', () => {
    const workflow = WORKFLOW_REGISTRY['single-image'];

    expect(typeof workflow.slug).toBe('string');
    expect(typeof workflow.title).toBe('string');
    expect(typeof workflow.description).toBe('string');
    expect(['image-generation', 'video-generation', 'full-pipeline']).toContain(
      workflow.category,
    );
    expect(Array.isArray(workflow.tags)).toBe(true);
    expect(workflow.tags.length).toBeGreaterThan(0);
    expect(workflow.tags.every((tag) => typeof tag === 'string')).toBe(true);
    expect(workflow.tier).toBe('free');
    expect(typeof workflow.icon).toBe('string');
    expect(workflow.defaultModel).toBe('nano-banana-pro');
    expect(Array.isArray(workflow.inputTypes)).toBe(true);
    expect(workflow.inputTypes.length).toBeGreaterThan(0);
    expect(Array.isArray(workflow.outputTypes)).toBe(true);
    expect(workflow.outputTypes.length).toBeGreaterThan(0);
    expect(workflow.version).toBe(1);
  });

  test('all workflows should have required fields for marketplace', () => {
    const workflows = Object.values(WORKFLOW_REGISTRY);
    expect(workflows.length).toBe(6);

    workflows.forEach((workflow) => {
      // Required marketplace fields
      expect(workflow.slug).toBeDefined();
      expect(workflow.title).toBeDefined();
      expect(workflow.description).toBeDefined();
      expect(workflow.category).toBeDefined();
      expect(Array.isArray(workflow.tags)).toBe(true);
      expect(workflow.tier).toBe('free');
      expect(workflow.icon).toBeDefined();
      expect(workflow.defaultModel).toBeDefined();
      expect(Array.isArray(workflow.inputTypes)).toBe(true);
      expect(Array.isArray(workflow.outputTypes)).toBe(true);

      // Ensure non-empty arrays
      expect(workflow.tags.length).toBeGreaterThan(0);
      expect(workflow.inputTypes.length).toBeGreaterThan(0);
      expect(workflow.outputTypes.length).toBeGreaterThan(0);
    });
  });
});

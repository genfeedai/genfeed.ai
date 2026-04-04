vi.mock('@api/collections/workflows/registry/node-registry-adapter', () => ({
  UNIFIED_NODE_REGISTRY: {
    'ai-generate-image': { label: 'AI Generate Image' },
    'control-branch': { label: 'Branch' },
    'input-template': { label: 'Input Template' },
    'output-publish': { label: 'Publish' },
  },
}));

import {
  type CloudWorkflowFormat,
  type CoreWorkflowFormat,
  detectFormat,
  WorkflowFormatConverterService,
} from '@api/collections/workflows/services/workflow-format-converter.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeCoreWorkflow = (
  overrides: Partial<CoreWorkflowFormat> = {},
): CoreWorkflowFormat => ({
  edges: [],
  nodes: [
    {
      data: { label: 'Generate' },
      id: 'n1',
      position: { x: 0, y: 0 },
      type: 'imageGen',
    },
  ],
  ...overrides,
});

const makeCloudWorkflow = (
  overrides: Partial<CloudWorkflowFormat> = {},
): CloudWorkflowFormat => ({
  edges: [],
  nodes: [
    {
      data: { config: {}, label: 'AI Generate Image' },
      id: 'n1',
      position: { x: 0, y: 0 },
      type: 'ai-generate-image',
    },
  ],
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('detectFormat', () => {
  it('returns "cloud" for empty node list', () => {
    expect(detectFormat({ edges: [], nodes: [] })).toBe('cloud');
  });

  it('detects kebab-case nodes as cloud format', () => {
    expect(detectFormat(makeCloudWorkflow())).toBe('cloud');
  });

  it('detects camelCase nodes as core format', () => {
    expect(detectFormat(makeCoreWorkflow())).toBe('core');
  });

  it('detects cloud format when nodes match registry entries', () => {
    const mixed = makeCloudWorkflow({
      nodes: [
        {
          data: { config: {}, label: 'Publish' },
          id: 'n1',
          position: { x: 0, y: 0 },
          type: 'output-publish',
        },
      ],
    });
    expect(detectFormat(mixed)).toBe('cloud');
  });
});

describe('WorkflowFormatConverterService', () => {
  let service: WorkflowFormatConverterService;

  beforeEach(() => {
    service = new WorkflowFormatConverterService();
  });

  // ─── convertCoreToCloud ────────────────────────────────────────────────────

  describe('convertCoreToCloud', () => {
    it('maps known camelCase node types to kebab-case', () => {
      const core = makeCoreWorkflow({
        nodes: [
          {
            data: { label: 'Gen' },
            id: 'n1',
            position: { x: 0, y: 0 },
            type: 'imageGen',
          },
          {
            data: { label: 'Branch' },
            id: 'n2',
            position: { x: 100, y: 0 },
            type: 'condition',
          },
        ],
      });
      const { workflow } = service.convertCoreToCloud(core);
      expect(workflow.nodes[0].type).toBe('ai-generate-image');
      expect(workflow.nodes[1].type).toBe('control-branch');
    });

    it('preserves node id and position', () => {
      const core = makeCoreWorkflow();
      const { workflow } = service.convertCoreToCloud(core);
      expect(workflow.nodes[0].id).toBe('n1');
      expect(workflow.nodes[0].position).toEqual({ x: 0, y: 0 });
    });

    it('records unmapped node types and emits warnings', () => {
      const core = makeCoreWorkflow({
        nodes: [
          {
            data: { label: 'Mystery' },
            id: 'n1',
            position: { x: 0, y: 0 },
            type: 'unknownNode',
          },
        ],
      });
      const { unmappedNodeTypes, warnings } = service.convertCoreToCloud(core);
      expect(unmappedNodeTypes).toContain('unknownNode');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('maps edges preserving handles', () => {
      const core: CoreWorkflowFormat = {
        edges: [
          {
            id: 'e1',
            source: 'n1',
            sourceHandle: 'out',
            target: 'n2',
            targetHandle: 'in',
          },
        ],
        nodes: [
          { data: {}, id: 'n1', position: { x: 0, y: 0 }, type: 'imageGen' },
          { data: {}, id: 'n2', position: { x: 100, y: 0 }, type: 'publish' },
        ],
      };
      const { workflow } = service.convertCoreToCloud(core);
      expect(workflow.edges[0]).toMatchObject({
        id: 'e1',
        source: 'n1',
        sourceHandle: 'out',
        target: 'n2',
        targetHandle: 'in',
      });
    });

    it('preserves name and description from core workflow', () => {
      const core = makeCoreWorkflow({
        description: 'A workflow',
        name: 'My Workflow',
      });
      const { workflow } = service.convertCoreToCloud(core);
      expect(workflow.name).toBe('My Workflow');
      expect(workflow.description).toBe('A workflow');
    });

    it('strips non-config fields (status, error, progress) from node data', () => {
      const core: CoreWorkflowFormat = {
        edges: [],
        nodes: [
          {
            data: {
              error: 'oops',
              label: 'Gen',
              prompt: 'hello',
              status: 'idle',
            },
            id: 'n1',
            position: { x: 0, y: 0 },
            type: 'imageGen',
          },
        ],
      };
      const { workflow } = service.convertCoreToCloud(core);
      expect(workflow.nodes[0].data.config).toHaveProperty('prompt');
      expect(workflow.nodes[0].data.config).not.toHaveProperty('status');
      expect(workflow.nodes[0].data.config).not.toHaveProperty('error');
    });
  });

  // ─── convertCloudToCore ────────────────────────────────────────────────────

  describe('convertCloudToCore', () => {
    it('maps kebab-case types back to camelCase', () => {
      const cloud = makeCloudWorkflow();
      const { workflow } = service.convertCloudToCore(cloud);
      expect(workflow.nodes[0].type).toBe('imageGen');
    });

    it('warns for unmapped cloud node types', () => {
      const cloud = makeCloudWorkflow({
        nodes: [
          {
            data: { config: {}, label: 'X' },
            id: 'n1',
            position: { x: 0, y: 0 },
            type: 'custom-type',
          },
        ],
      });
      const { warnings } = service.convertCloudToCore(cloud);
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('sets version to 1 on output', () => {
      const { workflow } = service.convertCloudToCore(makeCloudWorkflow());
      expect(workflow.version).toBe(1);
    });

    it('merges config into node data with status: idle', () => {
      const cloud: CloudWorkflowFormat = {
        edges: [],
        nodes: [
          {
            data: { config: { model: 'flux' }, label: 'Gen' },
            id: 'n1',
            position: { x: 0, y: 0 },
            type: 'ai-generate-image',
          },
        ],
      };
      const { workflow } = service.convertCloudToCore(cloud);
      expect(workflow.nodes[0].data).toMatchObject({
        model: 'flux',
        status: 'idle',
      });
    });
  });

  // ─── ensureCloudFormat ────────────────────────────────────────────────────

  describe('ensureCloudFormat', () => {
    it('returns cloud workflow as-is when already in cloud format', () => {
      const cloud = makeCloudWorkflow();
      const { unmappedNodeTypes, warnings, workflow } =
        service.ensureCloudFormat(cloud);
      expect(workflow).toBe(cloud);
      expect(warnings).toEqual([]);
      expect(unmappedNodeTypes).toEqual([]);
    });

    it('converts core format workflow to cloud', () => {
      const core = makeCoreWorkflow();
      const { workflow } = service.ensureCloudFormat(core);
      expect(workflow.nodes[0].type).toBe('ai-generate-image');
    });
  });
});

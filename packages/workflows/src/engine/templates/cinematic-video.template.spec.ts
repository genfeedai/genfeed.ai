import {
  CINEMATIC_VIDEO_TEMPLATE,
  createCinematicWorkflowInstance,
  getAvailableTemplates,
  getTemplateById,
} from '@workflow-engine/templates/cinematic-video.template';
import { describe, expect, it } from 'vitest';

describe('CinematicVideoTemplate', () => {
  describe('Template Structure', () => {
    it('should have all required metadata', () => {
      expect(CINEMATIC_VIDEO_TEMPLATE.id).toBe('cinematic-video-ugc');
      expect(CINEMATIC_VIDEO_TEMPLATE.name).toBeTruthy();
      expect(CINEMATIC_VIDEO_TEMPLATE.description).toBeTruthy();
      expect(CINEMATIC_VIDEO_TEMPLATE.category).toBe('video-generation');
      expect(CINEMATIC_VIDEO_TEMPLATE.metadata.version).toBeTruthy();
      expect(CINEMATIC_VIDEO_TEMPLATE.metadata.tags.length).toBeGreaterThan(0);
    });

    it('should have correct number of nodes', () => {
      expect(CINEMATIC_VIDEO_TEMPLATE.nodes).toHaveLength(8);
    });

    it('should have correct number of edges', () => {
      expect(CINEMATIC_VIDEO_TEMPLATE.edges).toHaveLength(10);
    });

    it('should have all nodes with unique IDs', () => {
      const nodeIds = CINEMATIC_VIDEO_TEMPLATE.nodes.map((n) => n.id);
      const uniqueIds = new Set(nodeIds);
      expect(uniqueIds.size).toBe(nodeIds.length);
    });

    it('should have all edges with unique IDs', () => {
      const edgeIds = CINEMATIC_VIDEO_TEMPLATE.edges.map((e) => e.id);
      const uniqueIds = new Set(edgeIds);
      expect(uniqueIds.size).toBe(edgeIds.length);
    });
  });

  describe('Workflow Nodes', () => {
    it('should have CAST prompt generator as first node', () => {
      const castNode = CINEMATIC_VIDEO_TEMPLATE.nodes.find(
        (n) => n.id === 'cast-prompt-1',
      );
      expect(castNode).toBeDefined();
      expect(castNode?.type).toBe('cast-prompt-generator');
      expect(castNode?.config.presetId).toBe('hollywood_blockbuster');
    });

    it('should have video generation node', () => {
      const videoNode = CINEMATIC_VIDEO_TEMPLATE.nodes.find(
        (n) => n.id === 'video-gen-1',
      );
      expect(videoNode).toBeDefined();
      expect(videoNode?.type).toBe('video-generator');
      expect(videoNode?.inputs).toContain('cast-prompt-1');
    });

    it('should have two upscale nodes', () => {
      const upscale1 = CINEMATIC_VIDEO_TEMPLATE.nodes.find(
        (n) => n.id === 'upscale-1',
      );
      const upscale2 = CINEMATIC_VIDEO_TEMPLATE.nodes.find(
        (n) => n.id === 'upscale-2',
      );

      expect(upscale1).toBeDefined();
      expect(upscale2).toBeDefined();
      expect(upscale1?.type).toBe('video-upscale');
      expect(upscale2?.type).toBe('video-upscale');
    });

    it('should have second upscale as optional', () => {
      const upscale2 = CINEMATIC_VIDEO_TEMPLATE.nodes.find(
        (n) => n.id === 'upscale-2',
      );
      expect(upscale2?.config.enabled).toBe(false);
    });

    it('should have color grading node', () => {
      const colorNode = CINEMATIC_VIDEO_TEMPLATE.nodes.find(
        (n) => n.id === 'color-grade-1',
      );
      expect(colorNode).toBeDefined();
      expect(colorNode?.type).toBe('color-grade');
      expect(colorNode?.config.sourcePreset).toBe('cast-prompt-1');
    });

    it('should have film grain node', () => {
      const grainNode = CINEMATIC_VIDEO_TEMPLATE.nodes.find(
        (n) => n.id === 'film-grain-1',
      );
      expect(grainNode).toBeDefined();
      expect(grainNode?.type).toBe('film-grain');
      expect(grainNode?.config.sourcePreset).toBe('cast-prompt-1');
    });

    it('should have lens effects node', () => {
      const lensNode = CINEMATIC_VIDEO_TEMPLATE.nodes.find(
        (n) => n.id === 'lens-effects-1',
      );
      expect(lensNode).toBeDefined();
      expect(lensNode?.type).toBe('lens-effects');
      expect(lensNode?.config.sourcePreset).toBe('cast-prompt-1');
    });

    it('should have platform export node', () => {
      const exportNode = CINEMATIC_VIDEO_TEMPLATE.nodes.find(
        (n) => n.id === 'platform-export-1',
      );
      expect(exportNode).toBeDefined();
      expect(exportNode?.type).toBe('platform-export');
      expect(exportNode?.config.platforms).toContain('instagram');
      expect(exportNode?.config.platforms).toContain('tiktok');
      expect(exportNode?.config.platforms).toContain('youtube');
    });
  });

  describe('Workflow Edges', () => {
    it('should connect CAST prompt to video generation', () => {
      const edge = CINEMATIC_VIDEO_TEMPLATE.edges.find(
        (e) => e.source === 'cast-prompt-1' && e.target === 'video-gen-1',
      );
      expect(edge).toBeDefined();
    });

    it('should create linear video processing pipeline', () => {
      const pipelineEdges = [
        { source: 'video-gen-1', target: 'upscale-1' },
        { source: 'upscale-1', target: 'upscale-2' },
        { source: 'upscale-2', target: 'color-grade-1' },
        { source: 'color-grade-1', target: 'film-grain-1' },
        { source: 'film-grain-1', target: 'lens-effects-1' },
        { source: 'lens-effects-1', target: 'platform-export-1' },
      ];

      pipelineEdges.forEach(({ source, target }) => {
        const edge = CINEMATIC_VIDEO_TEMPLATE.edges.find(
          (e) => e.source === source && e.target === target,
        );
        expect(edge).toBeDefined();
      });
    });

    it('should connect CAST preset to post-processing nodes', () => {
      const presetConnections = [
        { source: 'cast-prompt-1', target: 'color-grade-1' },
        { source: 'cast-prompt-1', target: 'film-grain-1' },
        { source: 'cast-prompt-1', target: 'lens-effects-1' },
      ];

      presetConnections.forEach(({ source, target }) => {
        const edge = CINEMATIC_VIDEO_TEMPLATE.edges.find(
          (e) => e.source === source && e.target === target,
        );
        expect(edge).toBeDefined();
      });
    });

    it('should have correct handles for preset config edges', () => {
      const presetEdges = CINEMATIC_VIDEO_TEMPLATE.edges.filter(
        (e) => e.source === 'cast-prompt-1' && e.sourceHandle === 'preset',
      );
      expect(presetEdges.length).toBe(3); // color-grade, film-grain, lens-effects
    });
  });

  describe('createCinematicWorkflowInstance', () => {
    it('should create workflow instance with required IDs', () => {
      const instance = createCinematicWorkflowInstance({
        organizationId: 'org-456',
        userId: 'user-789',
        workflowId: 'wf-123',
      });

      expect(instance.id).toBe('wf-123');
      expect(instance.organizationId).toBe('org-456');
      expect(instance.userId).toBe('user-789');
    });

    it('should apply CAST config overrides', () => {
      const instance = createCinematicWorkflowInstance({
        castConfig: {
          action: 'custom action',
          cameraMovement: 'handheld',
          presetId: 'indie_film',
        },
        organizationId: 'org-456',
        userId: 'user-789',
        workflowId: 'wf-123',
      });

      const castNode = instance.nodes.find(
        (n: any) => n.id === 'cast-prompt-1',
      );
      expect(castNode?.config.presetId).toBe('indie_film');
      expect(castNode?.config.cameraMovement).toBe('handheld');
      expect(castNode?.config.action).toBe('custom action');
    });

    it('should apply video config overrides', () => {
      const instance = createCinematicWorkflowInstance({
        organizationId: 'org-456',
        userId: 'user-789',
        videoConfig: {
          aspectRatio: '9:16',
          duration: 10,
          fps: 30,
        },
        workflowId: 'wf-123',
      });

      const videoNode = instance.nodes.find((n: any) => n.id === 'video-gen-1');
      expect(videoNode?.config.duration).toBe(10);
      expect(videoNode?.config.aspectRatio).toBe('9:16');
      expect(videoNode?.config.fps).toBe(30);
    });

    it('should enable second upscale when requested', () => {
      const instance = createCinematicWorkflowInstance({
        enableSecondUpscale: true,
        organizationId: 'org-456',
        userId: 'user-789',
        workflowId: 'wf-123',
      });

      const upscale2Node = instance.nodes.find(
        (n: any) => n.id === 'upscale-2',
      );
      expect(upscale2Node?.config.enabled).toBe(true);
    });

    it('should configure export platforms', () => {
      const instance = createCinematicWorkflowInstance({
        exportPlatforms: ['instagram', 'youtube'],
        organizationId: 'org-456',
        userId: 'user-789',
        workflowId: 'wf-123',
      });

      const exportNode = instance.nodes.find(
        (n: any) => n.id === 'platform-export-1',
      );
      expect(exportNode?.config.platforms).toEqual(['instagram', 'youtube']);
    });

    it('should not modify original template', () => {
      const originalPreset = CINEMATIC_VIDEO_TEMPLATE.nodes.find(
        (n) => n.id === 'cast-prompt-1',
      )?.config.presetId;

      createCinematicWorkflowInstance({
        castConfig: { presetId: 'vintage_35mm' },
        organizationId: 'org-456',
        userId: 'user-789',
        workflowId: 'wf-123',
      });

      const unchangedPreset = CINEMATIC_VIDEO_TEMPLATE.nodes.find(
        (n) => n.id === 'cast-prompt-1',
      )?.config.presetId;

      expect(unchangedPreset).toBe(originalPreset);
    });
  });

  describe('getAvailableTemplates', () => {
    it('should return array of templates', () => {
      const templates = getAvailableTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should include cinematic video template', () => {
      const templates = getAvailableTemplates();
      const cinematicTemplate = templates.find(
        (t) => t.id === 'cinematic-video-ugc',
      );
      expect(cinematicTemplate).toBeDefined();
    });
  });

  describe('getTemplateById', () => {
    it('should return template when valid ID is provided', () => {
      const template = getTemplateById('cinematic-video-ugc');
      expect(template).toBeDefined();
      expect(template?.id).toBe('cinematic-video-ugc');
    });

    it('should return null when invalid ID is provided', () => {
      const template = getTemplateById('nonexistent-template');
      expect(template).toBeNull();
    });
  });

  describe('Platform Export Configuration', () => {
    it('should have correct Instagram format', () => {
      const exportNode = CINEMATIC_VIDEO_TEMPLATE.nodes.find(
        (n) => n.id === 'platform-export-1',
      );
      const config = exportNode?.config as Record<string, any>;
      const igFormat = config?.formats?.instagram;

      expect(igFormat).toBeDefined();
      expect(igFormat?.aspectRatio).toBe('9:16');
      expect(igFormat?.maxDuration).toBe(60);
      expect(igFormat?.codec).toBe('h264');
    });

    it('should have correct TikTok format', () => {
      const exportNode = CINEMATIC_VIDEO_TEMPLATE.nodes.find(
        (n) => n.id === 'platform-export-1',
      );
      const config = exportNode?.config as Record<string, any>;
      const tiktokFormat = config?.formats?.tiktok;

      expect(tiktokFormat).toBeDefined();
      expect(tiktokFormat?.aspectRatio).toBe('9:16');
      expect(tiktokFormat?.maxDuration).toBe(60);
    });

    it('should have correct YouTube format', () => {
      const exportNode = CINEMATIC_VIDEO_TEMPLATE.nodes.find(
        (n) => n.id === 'platform-export-1',
      );
      const config = exportNode?.config as Record<string, any>;
      const ytFormat = config?.formats?.youtube;

      expect(ytFormat).toBeDefined();
      expect(ytFormat?.aspectRatio).toBe('16:9');
      expect(ytFormat?.maxDuration).toBeNull();
    });

    it('should have watermark disabled by default', () => {
      const exportNode = CINEMATIC_VIDEO_TEMPLATE.nodes.find(
        (n) => n.id === 'platform-export-1',
      );
      const config = exportNode?.config as Record<string, any>;
      expect(config?.watermark?.enabled).toBe(false);
    });
  });

  describe('Node Dependencies', () => {
    it('should have correct input dependencies for each node', () => {
      const nodeInputs = [
        { expectedInputs: [], id: 'cast-prompt-1' },
        { expectedInputs: ['cast-prompt-1'], id: 'video-gen-1' },
        { expectedInputs: ['video-gen-1'], id: 'upscale-1' },
        { expectedInputs: ['upscale-1'], id: 'upscale-2' },
        { expectedInputs: ['upscale-2'], id: 'color-grade-1' },
        { expectedInputs: ['color-grade-1'], id: 'film-grain-1' },
        { expectedInputs: ['film-grain-1'], id: 'lens-effects-1' },
        { expectedInputs: ['lens-effects-1'], id: 'platform-export-1' },
      ];

      nodeInputs.forEach(({ id, expectedInputs }) => {
        const node = CINEMATIC_VIDEO_TEMPLATE.nodes.find((n) => n.id === id);
        expect(node?.inputs).toEqual(expectedInputs);
      });
    });
  });

  describe('Real-world Workflow Scenarios', () => {
    it('should create Instagram-optimized workflow', () => {
      const instance = createCinematicWorkflowInstance({
        castConfig: {
          cameraMovement: 'tracking',
          presetId: 'social_media_cinematic',
        },
        exportPlatforms: ['instagram'],
        organizationId: 'org-1',
        userId: 'user-1',
        videoConfig: {
          aspectRatio: '9:16',
          duration: 15,
        },
        workflowId: 'ig-wf-1',
      });

      const castNode = instance.nodes.find(
        (n: any) => n.id === 'cast-prompt-1',
      );
      expect(castNode?.config.presetId).toBe('social_media_cinematic');

      const videoNode = instance.nodes.find((n: any) => n.id === 'video-gen-1');
      expect(videoNode?.config.aspectRatio).toBe('9:16');

      const exportNode = instance.nodes.find(
        (n: any) => n.id === 'platform-export-1',
      );
      expect(exportNode?.config.platforms).toEqual(['instagram']);
    });

    it('should create high-quality multi-platform workflow', () => {
      const instance = createCinematicWorkflowInstance({
        castConfig: {
          presetId: 'hollywood_blockbuster',
        },
        enableSecondUpscale: true,
        exportPlatforms: ['instagram', 'tiktok', 'youtube'],
        organizationId: 'org-1',
        userId: 'user-1',
        videoConfig: {
          duration: 30,
          fps: 30,
        },
        workflowId: 'multi-wf-1',
      });

      const upscale2 = instance.nodes.find((n: any) => n.id === 'upscale-2');
      expect(upscale2?.config.enabled).toBe(true);

      const exportNode = instance.nodes.find(
        (n: any) => n.id === 'platform-export-1',
      );
      expect(exportNode?.config.platforms).toHaveLength(3);
    });
  });
});

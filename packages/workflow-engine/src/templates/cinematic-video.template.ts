import type { ExecutableEdge, ExecutableNode } from '@workflow-engine/types';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: ExecutableNode[];
  edges: ExecutableEdge[];
  metadata: {
    version: string;
    createdAt: string;
    tags: string[];
  };
}

/**
 * Cinematic Video Workflow Template
 *
 * Workflow chain:
 * 1. CAST prompt generation
 * 2. Video generation (model TBD: Sora/Kling/etc)
 * 3. Upscale pass 1
 * 4. Upscale pass 2 (optional)
 * 5. Color grade (from preset)
 * 6. Film grain (from preset)
 * 7. Lens effects (from preset)
 * 8. Platform export
 */
export const CINEMATIC_VIDEO_TEMPLATE: WorkflowTemplate = {
  category: 'video-generation',
  description:
    'Complete cinematic video generation pipeline using CAST prompt framework with professional post-processing',
  edges: [
    {
      id: 'edge-1',
      source: 'cast-prompt-1',
      sourceHandle: 'output',
      target: 'video-gen-1',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-2',
      source: 'video-gen-1',
      sourceHandle: 'output',
      target: 'upscale-1',
      targetHandle: 'input',
    },
    {
      id: 'edge-3',
      source: 'upscale-1',
      sourceHandle: 'output',
      target: 'upscale-2',
      targetHandle: 'input',
    },
    {
      id: 'edge-4',
      source: 'upscale-2',
      sourceHandle: 'output',
      target: 'color-grade-1',
      targetHandle: 'input',
    },
    {
      id: 'edge-5',
      source: 'cast-prompt-1',
      sourceHandle: 'preset',
      target: 'color-grade-1',
      targetHandle: 'preset-config',
    },
    {
      id: 'edge-6',
      source: 'color-grade-1',
      sourceHandle: 'output',
      target: 'film-grain-1',
      targetHandle: 'input',
    },
    {
      id: 'edge-7',
      source: 'cast-prompt-1',
      sourceHandle: 'preset',
      target: 'film-grain-1',
      targetHandle: 'preset-config',
    },
    {
      id: 'edge-8',
      source: 'film-grain-1',
      sourceHandle: 'output',
      target: 'lens-effects-1',
      targetHandle: 'input',
    },
    {
      id: 'edge-9',
      source: 'cast-prompt-1',
      sourceHandle: 'preset',
      target: 'lens-effects-1',
      targetHandle: 'preset-config',
    },
    {
      id: 'edge-10',
      source: 'lens-effects-1',
      sourceHandle: 'output',
      target: 'platform-export-1',
      targetHandle: 'input',
    },
  ],
  id: 'cinematic-video-ugc',
  metadata: {
    createdAt: new Date().toISOString(),
    tags: ['video', 'cinematic', 'ugc', 'ai-generation', 'cast-framework'],
    version: '1.0.0',
  },
  name: 'UGC Cinematic Video Workflow',
  nodes: [
    // Node 1: CAST Prompt Generator
    {
      config: {
        action: '',
        cameraMovement: 'dolly',
        colorPalette: '',
        lighting: '',
        mood: '',
        presetId: 'hollywood_blockbuster',
        subject: '',
      },
      id: 'cast-prompt-1',
      inputs: [],
      label: 'CAST Prompt Generator',
      type: 'cast-prompt-generator',
    },

    // Node 2: Video Generation
    {
      config: {
        aspectRatio: '16:9',
        duration: 5,
        fps: 24,
        model: 'auto', // Will be determined by preset or user selection
        qualityPreset: 'high',
      },
      id: 'video-gen-1',
      inputs: ['cast-prompt-1'],
      label: 'AI Video Generation',
      type: 'video-generator',
    },

    // Node 3: Upscale Pass 1
    {
      config: {
        denoise: 0.1,
        method: 'ai-enhance',
        preserveDetails: true,
        scaleFactor: 2,
      },
      id: 'upscale-1',
      inputs: ['video-gen-1'],
      label: 'Upscale Pass 1',
      type: 'video-upscale',
    },

    // Node 4: Upscale Pass 2 (Optional)
    {
      config: {
        denoise: 0.05,
        enabled: false, // Can be toggled by user
        method: 'ai-enhance',
        preserveDetails: true,
        scaleFactor: 1.5,
      },
      id: 'upscale-2',
      inputs: ['upscale-1'],
      label: 'Upscale Pass 2 (Optional)',
      type: 'video-upscale',
    },

    // Node 5: Color Grading
    {
      config: {
        cameraProfile: '',
        contrast: 1.0,
        highlights: 0,
        midtones: 0,
        saturation: 1.0,
        shadows: 0,
        sourcePreset: 'cast-prompt-1', // Pulls config from CAST preset
        temperature: 5600,
      },
      id: 'color-grade-1',
      inputs: ['upscale-2'],
      label: 'Color Grading',
      type: 'color-grade',
    },

    // Node 6: Film Grain
    {
      config: {
        colorGrain: false,
        intensity: 0.0,
        size: 'fine',
        sourcePreset: 'cast-prompt-1', // Pulls config from CAST preset
        stock: 'Digital Clean',
      },
      id: 'film-grain-1',
      inputs: ['color-grade-1'],
      label: 'Film Grain',
      type: 'film-grain',
    },

    // Node 7: Lens Effects
    {
      config: {
        barrelDistortion: {
          amount: 0,
          enabled: false,
        },
        bloom: {
          enabled: false,
          intensity: 0,
          threshold: 0,
        },
        chromaticAberration: {
          enabled: false,
          intensity: 0,
        },
        sourcePreset: 'cast-prompt-1', // Pulls config from CAST preset
        vignette: {
          enabled: false,
          intensity: 0,
          softness: 0,
        },
      },
      id: 'lens-effects-1',
      inputs: ['film-grain-1'],
      label: 'Lens Effects',
      type: 'lens-effects',
    },

    // Node 8: Platform Export
    {
      config: {
        formats: {
          instagram: {
            aspectRatio: '9:16',
            bitrate: '8000k',
            codec: 'h264',
            maxDuration: 60,
          },
          tiktok: {
            aspectRatio: '9:16',
            bitrate: '8000k',
            codec: 'h264',
            maxDuration: 60,
          },
          youtube: {
            aspectRatio: '16:9',
            bitrate: '12000k',
            codec: 'h264',
            maxDuration: null,
          },
        },
        platforms: ['instagram', 'tiktok', 'youtube'],
        watermark: {
          enabled: false,
          opacity: 0.3,
          position: 'bottom-right',
        },
      },
      id: 'platform-export-1',
      inputs: ['lens-effects-1'],
      label: 'Platform Export',
      type: 'platform-export',
    },
  ],
};

/**
 * Create a new workflow instance from the template with custom config
 */
export const createCinematicWorkflowInstance = (config: {
  workflowId: string;
  organizationId: string;
  userId: string;
  castConfig?: Partial<{
    presetId: string;
    cameraMovement: string;
    action: string;
    subject: string;
    lighting: string;
    colorPalette: string;
    mood: string;
  }>;
  videoConfig?: Partial<{
    model: string;
    duration: number;
    aspectRatio: string;
    fps: number;
  }>;
  enableSecondUpscale?: boolean;
  exportPlatforms?: string[];
}) => {
  const template = JSON.parse(JSON.stringify(CINEMATIC_VIDEO_TEMPLATE)); // Deep clone

  // Apply CAST config overrides
  if (config.castConfig) {
    const castNode = template.nodes.find(
      (n: ExecutableNode) => n.id === 'cast-prompt-1',
    );
    if (castNode) {
      castNode.config = { ...castNode.config, ...config.castConfig };
    }
  }

  // Apply video generation config overrides
  if (config.videoConfig) {
    const videoNode = template.nodes.find(
      (n: ExecutableNode) => n.id === 'video-gen-1',
    );
    if (videoNode) {
      videoNode.config = { ...videoNode.config, ...config.videoConfig };
    }
  }

  // Enable/disable second upscale pass
  if (config.enableSecondUpscale !== undefined) {
    const upscale2Node = template.nodes.find(
      (n: ExecutableNode) => n.id === 'upscale-2',
    );
    if (upscale2Node) {
      upscale2Node.config.enabled = config.enableSecondUpscale;
    }
  }

  // Configure export platforms
  if (config.exportPlatforms) {
    const exportNode = template.nodes.find(
      (n: ExecutableNode) => n.id === 'platform-export-1',
    );
    if (exportNode) {
      exportNode.config.platforms = config.exportPlatforms;
    }
  }

  // Destructure to avoid overwriting custom id
  const { id: _templateId, ...templateWithoutId } = template;

  return {
    ...templateWithoutId,
    id: config.workflowId,
    organizationId: config.organizationId,
    userId: config.userId,
  };
};

/**
 * Get list of all available workflow templates
 */
export const getAvailableTemplates = (): WorkflowTemplate[] => {
  return [CINEMATIC_VIDEO_TEMPLATE];
};

/**
 * Get template by ID
 */
export const getTemplateById = (id: string): WorkflowTemplate | null => {
  const templates = getAvailableTemplates();
  return templates.find((t) => t.id === id) || null;
};

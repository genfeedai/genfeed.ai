// =============================================================================
// NODE DEFINITION & REGISTRY
// =============================================================================

import type { NodeCategory, NodeType } from './base';
import type { HandleDefinition } from './handles';
import type { WorkflowNodeData } from './union';

export interface NodeDefinition {
  type: NodeType;
  label: string;
  description: string;
  category: NodeCategory;
  icon: string;
  inputs: HandleDefinition[];
  outputs: HandleDefinition[];
  defaultData: Partial<WorkflowNodeData>;
}

// =============================================================================
// NODE REGISTRY
// =============================================================================

export const NODE_DEFINITIONS: Record<NodeType, NodeDefinition> = {
  animation: {
    category: 'processing',
    defaultData: {
      curveType: 'preset',
      customCurve: [0.645, 0.045, 0.355, 1],
      inputVideo: null,
      label: 'Animation',
      outputVideo: null,
      preset: 'easeInOutCubic',
      speedMultiplier: 1,
      status: 'idle',
    },
    description: 'Apply easing curve to video',
    icon: 'Wand2',
    inputs: [{ id: 'video', label: 'Video', required: true, type: 'video' }],
    label: 'Animation',
    outputs: [{ id: 'video', label: 'Animated Video', type: 'video' }],
    type: 'animation',
  },
  annotation: {
    category: 'processing',
    defaultData: {
      annotations: [],
      hasAnnotations: false,
      inputImage: null,
      label: 'Annotation',
      outputImage: null,
      status: 'idle',
    },
    description: 'Add shapes, arrows, and text to images',
    icon: 'Pencil',
    inputs: [{ id: 'image', label: 'Image', required: true, type: 'image' }],
    label: 'Annotation',
    outputs: [{ id: 'image', label: 'Annotated Image', type: 'image' }],
    type: 'annotation',
  },
  audioInput: {
    category: 'input',
    defaultData: {
      audio: null,
      duration: null,
      filename: null,
      label: 'Audio',
      source: 'upload',
      status: 'idle',
    },
    description: 'Upload an audio file (MP3, WAV)',
    icon: 'Volume2',
    inputs: [],
    label: 'Audio',
    outputs: [{ id: 'audio', label: 'Audio', type: 'audio' }],
    type: 'audioInput',
  },

  // Output nodes
  download: {
    category: 'output',
    defaultData: {
      inputImage: null,
      inputType: null,
      inputVideo: null,
      label: 'Download',
      outputName: 'output',
      status: 'idle',
    },
    description: 'Download workflow output with custom filename',
    icon: 'Download',
    inputs: [
      { id: 'image', label: 'Image', type: 'image' },
      { id: 'video', label: 'Video', type: 'video' },
    ],
    label: 'Download',
    outputs: [],
    type: 'download',
  },
  imageCompare: {
    category: 'output',
    defaultData: {
      imageA: null,
      imageB: null,
      label: 'Image Compare',
      status: 'idle',
    },
    description: 'Side-by-side A/B comparison with draggable slider',
    icon: 'Columns2',
    inputs: [
      { id: 'image', label: 'Image A', type: 'image' },
      { id: 'image-1', label: 'Image B', type: 'image' },
    ],
    label: 'Image Compare',
    outputs: [],
    type: 'imageCompare',
  },
  // AI nodes
  imageGen: {
    category: 'ai',
    defaultData: {
      aspectRatio: '1:1',
      inputImages: [],
      inputPrompt: null,
      jobId: null,
      label: 'Image Generator',
      model: 'nano-banana-pro',
      outputFormat: 'jpg',
      outputImage: null,
      outputImages: [],
      resolution: '2K',
      status: 'idle',
    },
    description: 'Generate images with nano-banana models',
    icon: 'Sparkles',
    inputs: [
      { id: 'prompt', label: 'Prompt', required: true, type: 'text' },
      {
        id: 'images',
        label: 'Reference Images',
        multiple: true,
        type: 'image',
      },
    ],
    label: 'Image Generator',
    outputs: [{ id: 'image', label: 'Generated Image', type: 'image' }],
    type: 'imageGen',
  },
  imageGridSplit: {
    category: 'processing',
    defaultData: {
      borderInset: 10,
      gridCols: 3,
      gridRows: 2,
      inputImage: null,
      label: 'Grid Split',
      outputFormat: 'jpg',
      outputImages: [],
      quality: 95,
      status: 'idle',
    },
    description: 'Split image into grid cells',
    icon: 'Grid3X3',
    inputs: [{ id: 'image', label: 'Image', required: true, type: 'image' }],
    label: 'Grid Split',
    outputs: [
      { id: 'images', label: 'Split Images', multiple: true, type: 'image' },
    ],
    type: 'imageGridSplit',
  },
  // Input nodes
  imageInput: {
    category: 'input',
    defaultData: {
      dimensions: null,
      filename: null,
      image: null,
      label: 'Image',
      source: 'upload',
      status: 'idle',
    },
    description: 'Upload or reference an image',
    icon: 'Image',
    inputs: [],
    label: 'Image',
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    type: 'imageInput',
  },
  lipSync: {
    category: 'ai',
    defaultData: {
      activeSpeaker: false,
      inputAudio: null,
      inputImage: null,
      inputVideo: null,
      jobId: null,
      label: 'Lip Sync',
      model: 'sync/lipsync-2',
      outputVideo: null,
      status: 'idle',
      syncMode: 'loop',
      temperature: 0.5,
    },
    description:
      'Generate talking-head video from image/video and audio using Replicate',
    icon: 'Mic',
    inputs: [
      { id: 'image', label: 'Face Image', type: 'image' },
      { id: 'video', label: 'Source Video', type: 'video' },
      { id: 'audio', label: 'Audio', required: true, type: 'audio' },
    ],
    label: 'Lip Sync',
    outputs: [{ id: 'video', label: 'Generated Video', type: 'video' }],
    type: 'lipSync',
  },
  llm: {
    category: 'ai',
    defaultData: {
      inputPrompt: null,
      jobId: null,
      label: 'LLM',
      maxTokens: 1024,
      model: 'meta-llama-3.1-405b-instruct',
      outputText: null,
      status: 'idle',
      systemPrompt:
        'You are a creative assistant helping generate content prompts.',
      temperature: 0.7,
      topP: 0.9,
    },
    description: 'Generate text with meta-llama',
    icon: 'Brain',
    inputs: [{ id: 'prompt', label: 'Prompt', required: true, type: 'text' }],
    label: 'LLM',
    outputs: [{ id: 'text', label: 'Generated Text', type: 'text' }],
    type: 'llm',
  },

  motionControl: {
    category: 'ai',
    defaultData: {
      aspectRatio: '16:9',
      cameraIntensity: 50,
      cameraMovement: 'static',
      characterOrientation: 'image',
      duration: 5,
      inputImage: null,
      inputPrompt: null,
      inputVideo: null,
      jobId: null,
      keepOriginalSound: true,
      label: 'Motion Control',
      mode: 'video_transfer',
      motionStrength: 50,
      negativePrompt: '',
      outputVideo: null,
      qualityMode: 'pro',
      seed: null,
      status: 'idle',
      trajectoryPoints: [],
    },
    description: 'Generate video with precise motion control using Kling AI',
    icon: 'Navigation',
    inputs: [
      { id: 'image', label: 'Image', required: true, type: 'image' },
      { id: 'video', label: 'Motion Video', type: 'video' },
      { id: 'prompt', label: 'Prompt', type: 'text' },
    ],
    label: 'Motion Control',
    outputs: [{ id: 'video', label: 'Video', type: 'video' }],
    type: 'motionControl',
  },

  outputGallery: {
    category: 'output',
    defaultData: {
      images: [],
      label: 'Output Gallery',
      status: 'idle',
    },
    description: 'Thumbnail grid with lightbox for multi-image outputs',
    icon: 'LayoutGrid',
    inputs: [{ id: 'image', label: 'Images', multiple: true, type: 'image' }],
    label: 'Output Gallery',
    outputs: [],
    type: 'outputGallery',
  },
  prompt: {
    category: 'input',
    defaultData: {
      label: 'Prompt',
      prompt: '',
      status: 'idle',
      variables: {},
    },
    description: 'Text prompt for AI generation',
    icon: 'MessageSquare',
    inputs: [],
    label: 'Prompt',
    outputs: [{ id: 'text', label: 'Prompt', type: 'text' }],
    type: 'prompt',
  },
  promptConstructor: {
    category: 'input',
    defaultData: {
      label: 'Prompt Constructor',
      outputText: null,
      status: 'idle',
      template: '',
      unresolvedVars: [],
    },
    description:
      'Template-based prompt with @variable interpolation from connected Prompt nodes',
    icon: 'Puzzle',
    inputs: [{ id: 'text', label: 'Variables', multiple: true, type: 'text' }],
    label: 'Prompt Constructor',
    outputs: [{ id: 'text', label: 'Prompt', type: 'text' }],
    type: 'promptConstructor',
  },
  reframe: {
    category: 'processing',
    defaultData: {
      aspectRatio: '16:9',
      gridPosition: { x: 0.5, y: 0.5 },
      inputImage: null,
      inputType: null,
      inputVideo: null,
      jobId: null,
      label: 'Reframe',
      model: 'photon-flash-1',
      outputImage: null,
      outputVideo: null,
      prompt: '',
      status: 'idle',
    },
    description:
      'Reframe images or videos to different aspect ratios with AI outpainting',
    icon: 'Crop',
    inputs: [
      { id: 'image', label: 'Image', type: 'image' },
      { id: 'video', label: 'Video', type: 'video' },
    ],
    label: 'Reframe',
    outputs: [
      { id: 'image', label: 'Reframed Image', type: 'image' },
      { id: 'video', label: 'Reframed Video', type: 'video' },
    ],
    type: 'reframe',
  },

  // Processing nodes
  resize: {
    category: 'processing',
    defaultData: {
      gridPosition: { x: 0.5, y: 0.5 },
      inputMedia: null,
      inputType: null,
      jobId: null,
      label: 'Resize',
      outputMedia: null,
      prompt: '',
      status: 'idle',
      targetAspectRatio: '16:9',
    },
    description:
      'Resize images or videos to different aspect ratios using Luma AI',
    icon: 'Maximize2',
    inputs: [{ id: 'media', label: 'Media', required: true, type: 'image' }],
    label: 'Resize',
    outputs: [{ id: 'media', label: 'Resized Media', type: 'image' }],
    type: 'resize',
  },
  subtitle: {
    category: 'processing',
    defaultData: {
      backgroundColor: 'rgba(0,0,0,0.7)',
      fontColor: '#FFFFFF',
      fontFamily: 'Arial',
      fontSize: 24,
      inputText: null,
      inputVideo: null,
      jobId: null,
      label: 'Subtitle',
      outputVideo: null,
      position: 'bottom',
      status: 'idle',
      style: 'modern',
    },
    description: 'Burn subtitles into video using FFmpeg',
    icon: 'Subtitles',
    inputs: [
      { id: 'video', label: 'Video', required: true, type: 'video' },
      { id: 'text', label: 'Subtitle Text', required: true, type: 'text' },
    ],
    label: 'Subtitle',
    outputs: [{ id: 'video', label: 'Video with Subtitles', type: 'video' }],
    type: 'subtitle',
  },
  textToSpeech: {
    category: 'ai',
    defaultData: {
      inputText: null,
      jobId: null,
      label: 'Text to Speech',
      outputAudio: null,
      provider: 'elevenlabs',
      similarityBoost: 0.75,
      speed: 1.0,
      stability: 0.5,
      status: 'idle',
      voice: 'rachel',
    },
    description: 'Convert text to natural-sounding speech using ElevenLabs',
    icon: 'AudioLines',
    inputs: [{ id: 'text', label: 'Text', required: true, type: 'text' }],
    label: 'Text to Speech',
    outputs: [{ id: 'audio', label: 'Audio', type: 'audio' }],
    type: 'textToSpeech',
  },
  transcribe: {
    category: 'ai',
    defaultData: {
      inputAudio: null,
      inputVideo: null,
      jobId: null,
      label: 'Transcribe',
      language: 'auto',
      outputText: null,
      status: 'idle',
      timestamps: false,
    },
    description: 'Convert video or audio to text transcript',
    icon: 'FileText',
    inputs: [
      { id: 'video', label: 'Video', type: 'video' },
      { id: 'audio', label: 'Audio', type: 'audio' },
    ],
    label: 'Transcribe',
    outputs: [{ id: 'text', label: 'Transcript', type: 'text' }],
    type: 'transcribe',
  },
  upscale: {
    category: 'processing',
    defaultData: {
      comparisonPosition: 50,
      faceEnhancement: false,
      faceEnhancementCreativity: 0,
      faceEnhancementStrength: 80,
      inputImage: null,
      inputType: null,
      inputVideo: null,
      jobId: null,
      label: 'Upscale',
      model: 'topaz-standard-v2',
      originalPreview: null,
      outputFormat: 'png',
      outputImage: null,
      outputPreview: null,
      outputVideo: null,
      showComparison: true,
      status: 'idle',
      targetFps: 30,
      targetResolution: '1080p',
      upscaleFactor: '2x',
    },
    description: 'AI-powered upscaling for images and videos',
    icon: 'Maximize',
    inputs: [
      { id: 'image', label: 'Image', type: 'image' },
      { id: 'video', label: 'Video', type: 'video' },
    ],
    label: 'Upscale',
    outputs: [
      { id: 'image', label: 'Upscaled Image', type: 'image' },
      { id: 'video', label: 'Upscaled Video', type: 'video' },
    ],
    type: 'upscale',
  },
  videoFrameExtract: {
    category: 'processing',
    defaultData: {
      inputVideo: null,
      jobId: null,
      label: 'Frame Extract',
      outputImage: null,
      percentagePosition: 100,
      selectionMode: 'last',
      status: 'idle',
      timestampSeconds: 0,
      videoDuration: null,
    },
    description: 'Extract a specific frame from video as image',
    icon: 'Film',
    inputs: [{ id: 'video', label: 'Video', required: true, type: 'video' }],
    label: 'Frame Extract',
    outputs: [{ id: 'image', label: 'Extracted Frame', type: 'image' }],
    type: 'videoFrameExtract',
  },
  videoGen: {
    category: 'ai',
    defaultData: {
      aspectRatio: '16:9',
      duration: 8,
      generateAudio: true,
      inputImage: null,
      inputPrompt: null,
      jobId: null,
      label: 'Video Generator',
      lastFrame: null,
      model: 'veo-3.1-fast',
      negativePrompt: '',
      outputVideo: null,
      referenceImages: [],
      resolution: '1080p',
      status: 'idle',
    },
    description: 'Generate videos with veo-3.1 models',
    icon: 'Video',
    inputs: [
      { id: 'prompt', label: 'Prompt', required: true, type: 'text' },
      { id: 'image', label: 'Starting Frame', type: 'image' },
      { id: 'lastFrame', label: 'Last Frame (interpolation)', type: 'image' },
    ],
    label: 'Video Generator',
    outputs: [{ id: 'video', label: 'Generated Video', type: 'video' }],
    type: 'videoGen',
  },
  videoInput: {
    category: 'input',
    defaultData: {
      dimensions: null,
      duration: null,
      filename: null,
      label: 'Video',
      source: 'upload',
      status: 'idle',
      video: null,
    },
    description: 'Upload or reference a video file',
    icon: 'FileVideo',
    inputs: [],
    label: 'Video',
    outputs: [{ id: 'video', label: 'Video', type: 'video' }],
    type: 'videoInput',
  },
  videoStitch: {
    category: 'processing',
    defaultData: {
      inputVideos: [],
      label: 'Video Stitch',
      outputVideo: null,
      seamlessLoop: false,
      status: 'idle',
      transitionDuration: 0.5,
      transitionType: 'crossfade',
    },
    description: 'Concatenate multiple videos',
    icon: 'Layers',
    inputs: [
      {
        id: 'videos',
        label: 'Videos',
        multiple: true,
        required: true,
        type: 'video',
      },
    ],
    label: 'Video Stitch',
    outputs: [{ id: 'video', label: 'Stitched Video', type: 'video' }],
    type: 'videoStitch',
  },
  videoTrim: {
    category: 'processing',
    defaultData: {
      duration: null,
      endTime: 60,
      inputVideo: null,
      jobId: null,
      label: 'Video Trim',
      outputVideo: null,
      startTime: 0,
      status: 'idle',
    },
    description: 'Trim video to a specific time range',
    icon: 'Scissors',
    inputs: [{ id: 'video', label: 'Video', required: true, type: 'video' }],
    label: 'Video Trim',
    outputs: [{ id: 'video', label: 'Trimmed Video', type: 'video' }],
    type: 'videoTrim',
  },
  voiceChange: {
    category: 'ai',
    defaultData: {
      audioMixLevel: 0.5,
      inputAudio: null,
      inputVideo: null,
      jobId: null,
      label: 'Voice Change',
      outputVideo: null,
      preserveOriginalAudio: false,
      status: 'idle',
    },
    description: 'Replace or mix audio track in a video',
    icon: 'AudioLines',
    inputs: [
      { id: 'video', label: 'Video', required: true, type: 'video' },
      { id: 'audio', label: 'New Audio', required: true, type: 'audio' },
    ],
    label: 'Voice Change',
    outputs: [{ id: 'video', label: 'Output Video', type: 'video' }],
    type: 'voiceChange',
  },

  // Composition nodes (workflow-as-node)
  workflowInput: {
    category: 'composition',
    defaultData: {
      description: '',
      inputName: 'input',
      inputType: 'image',
      label: 'Workflow Input',
      required: true,
      status: 'idle',
    },
    description:
      'Define an input port for when this workflow is used as a subworkflow',
    icon: 'ArrowRightToLine',
    inputs: [],
    label: 'Workflow Input',
    outputs: [{ id: 'value', label: 'Value', type: 'image' }], // Type is dynamic based on inputType
    type: 'workflowInput',
  },
  workflowOutput: {
    category: 'composition',
    defaultData: {
      description: '',
      inputValue: null,
      label: 'Workflow Output',
      outputName: 'output',
      outputType: 'image',
      status: 'idle',
    },
    description:
      'Define an output port for when this workflow is used as a subworkflow',
    icon: 'ArrowLeftFromLine',
    inputs: [{ id: 'value', label: 'Value', required: true, type: 'image' }], // Type is dynamic based on outputType
    label: 'Workflow Output',
    outputs: [],
    type: 'workflowOutput',
  },
  workflowRef: {
    category: 'composition',
    defaultData: {
      cachedInterface: null,
      childExecutionId: null,
      inputMappings: {},
      label: 'Subworkflow',
      outputMappings: {},
      referencedWorkflowId: null,
      referencedWorkflowName: null,
      status: 'idle',
    },
    description: 'Reference another workflow as a subworkflow',
    icon: 'GitBranch',
    inputs: [], // Dynamic based on referenced workflow interface
    label: 'Subworkflow',
    outputs: [], // Dynamic based on referenced workflow interface
    type: 'workflowRef',
  },

  // Multi-format nodes removed - format conversion now handled by schema-driven engine
};

// Explicit ordering for each category (most used first)
export const NODE_ORDER: Record<NodeCategory, NodeType[]> = {
  ai: [
    'imageGen',
    'videoGen',
    'llm',
    'lipSync',
    'textToSpeech',
    'transcribe',
    'voiceChange',
    'motionControl',
  ],
  composition: ['workflowRef', 'workflowInput', 'workflowOutput'],
  input: [
    'imageInput',
    'videoInput',
    'audioInput',
    'prompt',
    'promptConstructor',
  ],
  output: ['download', 'outputGallery', 'imageCompare'],
  processing: [
    'reframe',
    'upscale',
    'resize',
    'videoStitch',
    'videoTrim',
    'videoFrameExtract',
    'imageGridSplit',
    'annotation',
    'subtitle',
    'animation',
  ],
};

// Helper to get nodes by category with explicit ordering
export function getNodesByCategory(): Record<NodeCategory, NodeDefinition[]> {
  const categories: Record<NodeCategory, NodeDefinition[]> = {
    ai: [],
    composition: [],
    input: [],
    output: [],
    processing: [],
  };

  for (const category of Object.keys(NODE_ORDER) as NodeCategory[]) {
    for (const nodeType of NODE_ORDER[category]) {
      const def = NODE_DEFINITIONS[nodeType];
      if (def) {
        categories[category].push(def);
      }
    }
  }

  return categories;
}

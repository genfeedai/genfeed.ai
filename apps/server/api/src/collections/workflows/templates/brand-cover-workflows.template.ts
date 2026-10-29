import { createTemplateActionNode } from '@api/collections/workflows/templates/template-action-node';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

const TITLE_INPUT = {
  key: 'coverTitle',
  label: 'Cover Title',
  required: true,
  type: 'text',
} as const;

function titleInputNode(id: string, y: number) {
  return {
    data: {
      config: { inputName: 'coverTitle', inputType: 'text', required: true },
      label: 'Cover Title',
    },
    id,
    position: { x: 0, y },
    type: 'workflowInput',
  };
}

const LIVESTREAM_THUMBNAIL_TEMPLATE: WorkflowTemplate = {
  category: 'generation',
  description:
    'Generate a 16:9 livestream thumbnail with the brand headline font and the live version of the brand mark',
  edges: [
    {
      id: 'edge-livestream-scene-image',
      source: 'workflow-input-livestream-scene',
      sourceHandle: 'value',
      target: 'ai-generate-image-livestream',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-livestream-image-cover',
      source: 'ai-generate-image-livestream',
      sourceHandle: 'imageUrl',
      target: 'brand-cover-livestream',
      targetHandle: 'image',
    },
    {
      id: 'edge-livestream-title-cover',
      source: 'workflow-input-livestream-title',
      sourceHandle: 'value',
      target: 'brand-cover-livestream',
      targetHandle: 'title',
    },
    {
      id: 'edge-livestream-cover-output',
      source: 'brand-cover-livestream',
      sourceHandle: 'image',
      target: 'workflow-output-livestream-cover',
      targetHandle: 'value',
    },
  ],
  icon: 'youtube',
  id: 'youtube-livestream-thumbnail',
  inputVariables: [
    TITLE_INPUT,
    {
      key: 'coverScene',
      label: 'Backdrop Scene',
      required: true,
      type: 'text',
    },
  ],
  name: 'YouTube Livestream Thumbnail',
  nodes: [
    titleInputNode('workflow-input-livestream-title', 40),
    {
      data: {
        config: { inputName: 'coverScene', inputType: 'text', required: true },
        label: 'Backdrop Scene',
      },
      id: 'workflow-input-livestream-scene',
      position: { x: 0, y: 180 },
      type: 'workflowInput',
    },
    createTemplateActionNode('imageGen', {
      data: {
        config: {
          height: 1080,
          style: 'broadcast backdrop, clear space for a headline',
          width: 1920,
        },
        label: 'Backdrop',
      },
      id: 'ai-generate-image-livestream',
      position: { x: 360, y: 180 },
    }),
    createTemplateActionNode('brandCover', {
      data: {
        config: { placement: 'bottom', variant: 'live', width: 1920 },
        label: 'Brand Cover',
      },
      id: 'brand-cover-livestream',
      position: { x: 720, y: 100 },
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: { outputName: 'cover' },
        label: 'Thumbnail',
      },
      id: 'workflow-output-livestream-cover',
      position: { x: 1080, y: 100 },
    }),
  ],
};

const RECAP_THUMBNAIL_TEMPLATE: WorkflowTemplate = {
  category: 'generation',
  description:
    'Turn a frame of the episode into a 16:9 recap thumbnail with the brand headline font and mark',
  edges: [
    {
      id: 'edge-recap-video-cover',
      source: 'workflow-input-recap-video',
      sourceHandle: 'value',
      target: 'brand-cover-recap',
      targetHandle: 'video',
    },
    {
      id: 'edge-recap-title-cover',
      source: 'workflow-input-recap-title',
      sourceHandle: 'value',
      target: 'brand-cover-recap',
      targetHandle: 'title',
    },
    {
      id: 'edge-recap-cover-output',
      source: 'brand-cover-recap',
      sourceHandle: 'image',
      target: 'workflow-output-recap-cover',
      targetHandle: 'value',
    },
  ],
  icon: 'youtube',
  id: 'youtube-recap-thumbnail',
  inputVariables: [
    TITLE_INPUT,
    { key: 'recapVideo', label: 'Episode', required: true, type: 'video' },
  ],
  name: 'YouTube Recap Thumbnail',
  nodes: [
    titleInputNode('workflow-input-recap-title', 40),
    {
      data: {
        config: { inputName: 'recapVideo', inputType: 'video', required: true },
        label: 'Episode',
      },
      id: 'workflow-input-recap-video',
      position: { x: 0, y: 180 },
      type: 'workflowInput',
    },
    createTemplateActionNode('brandCover', {
      data: {
        config: {
          placement: 'bottom',
          timestampSeconds: 5,
          variant: 'default',
          width: 1920,
        },
        label: 'Brand Cover',
      },
      id: 'brand-cover-recap',
      position: { x: 360, y: 100 },
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: { outputName: 'cover' },
        label: 'Thumbnail',
      },
      id: 'workflow-output-recap-cover',
      position: { x: 720, y: 100 },
    }),
  ],
};

const SHORTS_COVER_TEMPLATE: WorkflowTemplate = {
  category: 'generation',
  description:
    'Turn a frame of the Short into a 9:16 cover with the headline stacked upper left and the brand mark',
  edges: [
    {
      id: 'edge-shorts-video-cover',
      source: 'workflow-input-shorts-video',
      sourceHandle: 'value',
      target: 'brand-cover-shorts',
      targetHandle: 'video',
    },
    {
      id: 'edge-shorts-title-cover',
      source: 'workflow-input-shorts-title',
      sourceHandle: 'value',
      target: 'brand-cover-shorts',
      targetHandle: 'title',
    },
    {
      id: 'edge-shorts-cover-output',
      source: 'brand-cover-shorts',
      sourceHandle: 'image',
      target: 'workflow-output-shorts-cover',
      targetHandle: 'value',
    },
  ],
  icon: 'youtube',
  id: 'youtube-shorts-cover',
  inputVariables: [
    TITLE_INPUT,
    { key: 'shortVideo', label: 'Short', required: true, type: 'video' },
  ],
  name: 'YouTube Shorts Cover',
  nodes: [
    titleInputNode('workflow-input-shorts-title', 40),
    {
      data: {
        config: { inputName: 'shortVideo', inputType: 'video', required: true },
        label: 'Short',
      },
      id: 'workflow-input-shorts-video',
      position: { x: 0, y: 180 },
      type: 'workflowInput',
    },
    createTemplateActionNode('brandCover', {
      data: {
        config: {
          placement: 'top-left',
          timestampSeconds: 2,
          variant: 'default',
          width: 1080,
        },
        label: 'Brand Cover',
      },
      id: 'brand-cover-shorts',
      position: { x: 360, y: 100 },
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: { outputName: 'cover' },
        label: 'Cover',
      },
      id: 'workflow-output-shorts-cover',
      position: { x: 720, y: 100 },
    }),
  ],
};

export const BRAND_COVER_WORKFLOW_TEMPLATES: Record<string, WorkflowTemplate> =
  {
    'youtube-livestream-thumbnail': LIVESTREAM_THUMBNAIL_TEMPLATE,
    'youtube-recap-thumbnail': RECAP_THUMBNAIL_TEMPLATE,
    'youtube-shorts-cover': SHORTS_COVER_TEMPLATE,
  };

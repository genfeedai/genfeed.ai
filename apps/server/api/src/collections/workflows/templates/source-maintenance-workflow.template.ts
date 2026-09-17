import { createTemplateActionNode } from '@api/collections/workflows/templates/template-action-node';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export const SOURCE_MAINTENANCE_WORKFLOW_TEMPLATE: WorkflowTemplate = {
  category: 'content',
  changeSummary:
    'Refresh one saved URL or RSS Knowledge source through canonical capture.',
  description:
    'Read a Knowledge source, recapture it when refresh is enabled, then read the resulting version. Archive is off by default. Schedule stays disabled until a source and policy are configured.',
  icon: 'refresh-cw',
  id: 'source-maintenance',
  inputVariables: [
    {
      description: 'Knowledge source to refresh.',
      key: 'sourceId',
      label: 'Source ID',
      required: true,
      type: 'text',
    },
  ],
  isScheduleEnabled: false,
  name: 'Source Maintenance',
  version: 1,
  nodes: [
    createTemplateActionNode('read_knowledge_source', {
      data: {
        config: {},
        inputVariableKeys: ['sourceId'],
        label: 'Read Source',
      },
      id: 'read-source',
      position: { x: 0, y: 160 },
    }),
    createTemplateActionNode('capture_knowledge', {
      data: {
        config: {},
        inputVariableKeys: ['sourceId'],
        label: 'Refresh Source',
      },
      id: 'refresh-source',
      position: { x: 360, y: 160 },
    }),
    createTemplateActionNode('read_knowledge_source', {
      data: {
        config: {},
        inputVariableKeys: ['sourceId'],
        label: 'Read Refreshed Source',
      },
      id: 'read-refreshed-source',
      position: { x: 720, y: 160 },
    }),
  ],
  edges: [
    {
      id: 'edge-read-to-capture',
      source: 'read-source',
      sourceHandle: '__sequence__',
      target: 'refresh-source',
    },
    {
      id: 'edge-capture-to-read',
      source: 'refresh-source',
      sourceHandle: '__sequence__',
      target: 'read-refreshed-source',
    },
  ],
};

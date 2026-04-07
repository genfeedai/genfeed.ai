import type { Meta, StoryObj } from '@storybook/nextjs';
import WorkflowCanvas from '@ui/workflow-builder/WorkflowCanvas';
import type { Edge, Node } from '@xyflow/react';

const meta: Meta<typeof WorkflowCanvas> = {
  argTypes: {
    edges: {
      control: 'object',
      description: 'Array of edges connecting nodes',
    },
    isReadOnly: {
      control: 'boolean',
      description: 'Whether the canvas is in read-only mode',
    },
    nodes: {
      control: 'object',
      description: 'Array of nodes to display on the canvas',
    },
    onConnect: {
      action: 'connected',
      description: 'Callback when nodes are connected',
    },
    onEdgesChange: {
      action: 'edges-changed',
      description: 'Callback when edges are modified',
    },
    onNodeSelect: {
      action: 'node-selected',
      description: 'Callback when a node is selected',
    },
    onNodesChange: {
      action: 'nodes-changed',
      description: 'Callback when nodes are modified',
    },
  },
  component: WorkflowCanvas,
  decorators: [
    (Story) => (
      <div style={{ height: '600px', width: '100%' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  title: 'Components/WorkflowBuilder/WorkflowCanvas',
};

export default meta;
type Story = StoryObj<typeof WorkflowCanvas>;

const mockNodes: Node[] = [
  {
    data: { config: {}, label: 'Image Input', nodeType: 'input-image' },
    id: 'node-1',
    position: { x: 100, y: 100 },
    type: 'input-node',
  },
  {
    data: {
      config: { aspectRatio: '16:9' },
      label: 'Resize',
      nodeType: 'process-resize',
    },
    id: 'node-2',
    position: { x: 300, y: 100 },
    type: 'process-node',
  },
  {
    data: { config: {}, label: 'Save', nodeType: 'output-save' },
    id: 'node-3',
    position: { x: 500, y: 100 },
    type: 'output-node',
  },
];

const mockEdges: Edge[] = [
  {
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
  },
  {
    id: 'edge-2',
    source: 'node-2',
    target: 'node-3',
  },
];

export const Default: Story = {
  args: {
    edges: [],
    isReadOnly: false,
    nodes: [],
    onConnect: () => {},
    onDrop: () => {},
    onEdgesChange: () => {},
    onNodeSelect: () => {},
    onNodesChange: () => {},
  },
};

export const WithNodes: Story = {
  args: {
    edges: mockEdges,
    isReadOnly: false,
    nodes: mockNodes,
    onConnect: () => {},
    onDrop: () => {},
    onEdgesChange: () => {},
    onNodeSelect: () => {},
    onNodesChange: () => {},
  },
};

export const ReadOnly: Story = {
  args: {
    edges: mockEdges,
    isReadOnly: true,
    nodes: mockNodes,
    onConnect: () => {},
    onDrop: () => {},
    onEdgesChange: () => {},
    onNodeSelect: () => {},
    onNodesChange: () => {},
  },
};

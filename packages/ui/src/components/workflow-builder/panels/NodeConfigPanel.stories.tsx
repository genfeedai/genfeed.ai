import type { WorkflowNodeData } from '@genfeedai/interfaces/automation/workflow-builder.interface';
import type { Meta, StoryObj } from '@storybook/nextjs';
import NodeConfigPanel from '@ui/workflow-builder/panels/NodeConfigPanel';
import type { Node } from '@xyflow/react';

const meta: Meta<typeof NodeConfigPanel> = {
  argTypes: {
    onClose: { action: 'closed' },
    onUpdateConfig: { action: 'config-updated' },
  },
  component: NodeConfigPanel,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  title: 'Components/WorkflowBuilder/Panels/NodeConfigPanel',
};

export default meta;
type Story = StoryObj<typeof NodeConfigPanel>;

const mockNode: Node<WorkflowNodeData> = {
  data: {
    config: { aspectRatio: '16:9' },
    definition: {
      category: 'processing',
      configSchema: {
        aspectRatio: {
          label: 'Aspect ratio',
          options: [
            { label: '16:9', value: '16:9' },
            { label: '9:16', value: '9:16' },
            { label: '1:1', value: '1:1' },
          ],
          type: 'select',
        },
      },
      description: 'Resize media',
      icon: 'resize',
      inputs: {},
      label: 'Resize',
      outputs: {},
    },
    inputVariableKeys: [],
    label: 'Resize',
    nodeType: 'process-resize',
  },
  id: 'node-1',
  position: { x: 100, y: 100 },
  type: 'process-node',
};

export const Default: Story = {
  args: {
    inputVariables: [],
    onClose: () => {},
    onUpdateConfig: () => {},
    selectedNode: mockNode,
  },
};

export const NoSelection: Story = {
  args: {
    inputVariables: [],
    onClose: () => {},
    onUpdateConfig: () => {},
    selectedNode: null,
  },
};

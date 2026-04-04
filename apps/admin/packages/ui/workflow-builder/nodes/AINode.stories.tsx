import type { Meta, StoryObj } from '@storybook/nextjs';
import AINode from '@ui/workflow-builder/nodes/AINode';

const meta: Meta<typeof AINode> = {
  argTypes: {
    id: { control: 'text' },
    isConnectable: { control: 'boolean' },
    selected: { control: 'boolean' },
  },
  component: AINode,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  title: 'Components/WorkflowBuilder/Nodes/AINode',
};

export default meta;
type Story = StoryObj<typeof AINode>;

export const GenerateImage: Story = {
  args: {
    data: {
      config: { model: 'dall-e-3' },
      definition: {
        category: 'ai',
        configSchema: {},
        description: 'Generate AI media from prompts',
        icon: 'sparkles',
        inputs: { prompt: { label: 'Prompt', type: 'text' } },
        label: 'AI Generate',
        outputs: { image: { label: 'Image', type: 'image' } },
      },
      inputVariableKeys: [],
      label: 'Generate Image',
      nodeType: 'ai-generate-image',
    },
    id: 'node-1',
    isConnectable: true,
    selected: false,
  },
};

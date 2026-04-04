import type { Meta, StoryObj } from '@storybook/nextjs';
import TagsManager from '@ui/tags/manager/TagsManager';

const meta: Meta<typeof TagsManager> = {
  argTypes: {},
  component: TagsManager,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Tags/TagsManager',
};

export default meta;
type Story = StoryObj<typeof TagsManager>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};

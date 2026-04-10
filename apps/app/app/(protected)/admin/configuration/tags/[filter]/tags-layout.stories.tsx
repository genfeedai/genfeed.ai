import type { Meta, StoryObj } from '@storybook/nextjs';
import TagsLayout from './tags-layout';

const meta: Meta<typeof TagsLayout> = {
  argTypes: {},
  component: TagsLayout,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Tags/TagsLayout',
};

export default meta;
type Story = StoryObj<typeof TagsLayout>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};

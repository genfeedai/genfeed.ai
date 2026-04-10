import type { Meta, StoryObj } from '@storybook/nextjs';
import TagsList from './tags-list';

const meta: Meta<typeof TagsList> = {
  argTypes: {},
  component: TagsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Tags/TagsList',
};

export default meta;
type Story = StoryObj<typeof TagsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};

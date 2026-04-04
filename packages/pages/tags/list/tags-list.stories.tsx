import TagsList from '@pages/tags/list/tags-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

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

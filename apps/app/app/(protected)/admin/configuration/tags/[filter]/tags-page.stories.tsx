import type { Meta, StoryObj } from '@storybook/nextjs';
import TagsPage from './tags-page';

const meta: Meta<typeof TagsPage> = {
  argTypes: {},
  component: TagsPage,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Tags/TagsPage',
};

export default meta;
type Story = StoryObj<typeof TagsPage>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};

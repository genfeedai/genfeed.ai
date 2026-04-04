import ModelsList from '@pages/models/list/models-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof ModelsList> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
  component: ModelsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Models/ModelsList',
};

export default meta;
type Story = StoryObj<typeof ModelsList>;

export const Default: Story = {
  args: {
    // TODO: Add default props
  },
};

export const Interactive: Story = {
  args: {
    // TODO: Add interactive props
  },
};

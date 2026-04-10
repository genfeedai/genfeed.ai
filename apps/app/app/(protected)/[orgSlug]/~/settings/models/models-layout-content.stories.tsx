import type { Meta, StoryObj } from '@storybook/nextjs';
import ModelsLayoutContent from './models-layout-content';

const meta: Meta<typeof ModelsLayoutContent> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
  component: ModelsLayoutContent,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Models/ModelsLayoutContent',
};

export default meta;
type Story = StoryObj<typeof ModelsLayoutContent>;

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

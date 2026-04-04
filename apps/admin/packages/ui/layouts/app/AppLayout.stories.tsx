import type { Meta, StoryObj } from '@storybook/nextjs';
import AppLayout from '@ui/layouts/app/AppLayout';

const meta: Meta<typeof AppLayout> = {
  argTypes: {},
  component: AppLayout,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Layouts/AppLayout',
};

export default meta;
type Story = StoryObj<typeof AppLayout>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};

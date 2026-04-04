import type { Meta, StoryObj } from '@storybook/nextjs';
import Portal from '@ui/layout/portal/Portal';

const meta: Meta<typeof Portal> = {
  argTypes: {},
  component: Portal,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/Portal',
};

export default meta;
type Story = StoryObj<typeof Portal>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};

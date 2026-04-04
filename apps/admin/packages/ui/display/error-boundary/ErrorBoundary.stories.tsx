import type { Meta, StoryObj } from '@storybook/nextjs';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';

const meta: Meta<typeof ErrorBoundary> = {
  argTypes: {},
  component: ErrorBoundary,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/ErrorBoundary',
};

export default meta;
type Story = StoryObj<typeof ErrorBoundary>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};

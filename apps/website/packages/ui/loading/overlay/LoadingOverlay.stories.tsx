import type { Meta, StoryObj } from '@storybook/nextjs';
import LoadingOverlay from '@ui/loading/overlay/LoadingOverlay';

/**
 * LoadingOverlay component displays a loading indicator over content.
 * Provides backdrop blur and loading message.
 */
const meta = {
  argTypes: {
    className: {
      control: 'text',
      description: 'Additional CSS classes',
    },
    message: {
      control: 'text',
      description: 'Loading message text',
    },
  },
  component: LoadingOverlay,
  parameters: {
    docs: {
      description: {
        component:
          'Overlay component for displaying loading states over content with backdrop blur.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Loading/LoadingOverlay',
} satisfies Meta<typeof LoadingOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default loading overlay
 */
export const Default: Story = {
  args: {
    message: 'Loading...',
  },
  parameters: {
    layout: 'padded',
  },
  render: (args) => (
    <div className="relative w-96 h-64 bg-background">
      <div className="p-4">
        <p>Content underneath</p>
        <div className="mt-4 p-4 bg-card">Some content</div>
      </div>
      <LoadingOverlay {...args} />
    </div>
  ),
};

/**
 * Custom message
 */
export const CustomMessage: Story = {
  args: {
    message: 'Saving changes...',
  },
  parameters: {
    layout: 'padded',
  },
  render: (args) => (
    <div className="relative w-96 h-64 bg-background">
      <div className="p-4">
        <p>Content underneath</p>
        <div className="mt-4 p-4 bg-card">Some content</div>
      </div>
      <LoadingOverlay {...args} />
    </div>
  ),
};

/**
 * Processing message
 */
export const Processing: Story = {
  args: {
    message: 'Processing...',
  },
  parameters: {
    layout: 'padded',
  },
  render: (args) => (
    <div className="relative w-96 h-64 bg-background">
      <div className="p-4">
        <p>Content underneath</p>
        <div className="mt-4 p-4 bg-card">Some content</div>
      </div>
      <LoadingOverlay {...args} />
    </div>
  ),
};

/**
 * Over large content
 */
export const OverLargeContent: Story = {
  args: {
    message: 'Loading content...',
  },
  parameters: {
    layout: 'padded',
  },
  render: (args) => (
    <div className="relative w-full h-96 bg-background overflow-auto">
      <div className="p-8 space-y-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="p-4 bg-card">
            Content item {i + 1}
          </div>
        ))}
      </div>
      <LoadingOverlay {...args} />
    </div>
  ),
};

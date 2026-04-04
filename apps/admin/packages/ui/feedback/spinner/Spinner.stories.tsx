import { ComponentSize } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import Spinner from '@ui/feedback/spinner/Spinner';

/**
 * Spinner component for loading states.
 * Simple, accessible loading indicator with multiple sizes.
 */
const meta = {
  argTypes: {
    className: {
      control: 'text',
      description: 'Additional CSS classes for custom styling',
    },
    size: {
      control: 'select',
      description: 'Spinner size',
      options: ['xs', 'sm', 'md', 'lg'],
    },
  },
  component: Spinner,
  parameters: {
    docs: {
      description: {
        component:
          'Loading spinner component for indicating processing or loading states.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/UI/Spinner',
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Extra small spinner
 */
export const ExtraSmall: Story = {
  args: {
    size: ComponentSize.XS,
  },
};

/**
 * Small spinner
 */
export const Small: Story = {
  args: {
    size: ComponentSize.SM,
  },
};

/**
 * Medium spinner (default)
 */
export const Medium: Story = {
  args: {
    size: ComponentSize.MD,
  },
};

/**
 * Large spinner
 */
export const Large: Story = {
  args: {
    size: ComponentSize.LG,
  },
};

/**
 * Custom colored spinner
 */
export const CustomColor: Story = {
  args: {
    className: 'text-primary',
    size: ComponentSize.LG,
  },
};

/**
 * In button context
 */
export const InButton: Story = {
  render: () => (
    <button
      className="inline-flex items-center justify-center gap-2 h-9 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground shadow hover:bg-primary/90"
      disabled
    >
      <Spinner size={ComponentSize.SM} />
      Loading...
    </button>
  ),
};

/**
 * Centered in card
 */
export const InCard: Story = {
  parameters: {
    layout: 'centered',
  },
  render: () => (
    <div className=" border border-white/[0.08] bg-background w-96 p-8">
      <div className="flex items-center justify-center">
        <Spinner size={ComponentSize.LG} />
      </div>
      <p className="text-center mt-4 text-foreground/70">Loading content...</p>
    </div>
  ),
};

/**
 * All sizes comparison
 */
export const AllSizes: Story = {
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="flex items-center gap-8 p-4">
      <div className="flex flex-col items-center gap-2">
        <Spinner size={ComponentSize.XS} />
        <span className="text-xs">XS</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size={ComponentSize.SM} />
        <span className="text-xs">SM</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size={ComponentSize.MD} />
        <span className="text-xs">MD</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size={ComponentSize.LG} />
        <span className="text-xs">LG</span>
      </div>
    </div>
  ),
};

/**
 * Different colors
 */
export const ColorVariants: Story = {
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="flex items-center gap-8 p-4">
      <div className="flex flex-col items-center gap-2">
        <Spinner size={ComponentSize.LG} className="text-primary" />
        <span className="text-xs">Primary</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size={ComponentSize.LG} className="text-secondary" />
        <span className="text-xs">Secondary</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size={ComponentSize.LG} className="text-accent" />
        <span className="text-xs">Accent</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size={ComponentSize.LG} className="text-success" />
        <span className="text-xs">Success</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size={ComponentSize.LG} className="text-error" />
        <span className="text-xs">Error</span>
      </div>
    </div>
  ),
};

/**
 * Loading overlay example
 */
export const LoadingOverlay: Story = {
  parameters: {
    layout: 'centered',
  },
  render: () => (
    <div className="relative w-96 h-64 bg-background overflow-hidden">
      <div className="absolute inset-0 bg-card/80 backdrop-blur-sm flex items-center justify-center z-10">
        <div className="flex flex-col items-center gap-4">
          <Spinner size={ComponentSize.LG} className="text-primary" />
          <p className="text-foreground">Processing your request...</p>
        </div>
      </div>
      <div className="p-6">
        <h3 className="font-bold text-lg mb-2">Content Area</h3>
        <p className="text-foreground/70">
          This content is covered by a loading overlay.
        </p>
      </div>
    </div>
  ),
};

import { ButtonVariant, CardEmptySize } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import { EmptyState, EmptyStateCard } from '@ui/card/EmptyState';
import { HiInboxStack, HiPhoto, HiPlus, HiVideoCamera } from 'react-icons/hi2';

const InboxIcon = ({ className }: { className?: string }) => (
  <HiInboxStack className={className} />
);
const PhotoIcon = ({ className }: { className?: string }) => (
  <HiPhoto className={className} />
);
const PlusIcon = ({ className }: { className?: string }) => (
  <HiPlus className={className} />
);
const VideoIcon = ({ className }: { className?: string }) => (
  <HiVideoCamera className={className} />
);

const noop = () => {
  // Action clicked
};

/**
 * EmptyState is the shared primitive for "nothing here yet" surfaces. Both a
 * `title` and an `action` are required — an empty state must always name what
 * is empty and offer a concrete next step, never render bare skeleton chrome.
 * Icons and descriptions are optional context.
 */
const meta = {
  argTypes: {
    action: {
      control: 'object',
      description: 'Required next-step action button configuration',
    },
    description: {
      control: 'text',
      description: 'Optional supporting copy under the title',
    },
    icon: {
      description: 'Optional icon element to display',
    },
    size: {
      control: 'select',
      description: 'Size variant',
      options: ['sm', 'default', 'lg'],
    },
    title: {
      control: 'text',
      description: 'Required headline describing what is empty',
    },
    variant: {
      control: 'select',
      description: 'Visual variant (EmptyStateCard only)',
      options: ['default', 'subtle', 'prominent'],
    },
  },
  component: EmptyState,
  parameters: {
    docs: {
      description: {
        component:
          "Empty state component for displaying messages when there's no content available.",
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/UI/EmptyState',
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default empty state
 */
export const Default: Story = {
  render: () => (
    <EmptyState
      icon={InboxIcon}
      title="No items found"
      description="Get started by creating your first item."
      action={{
        label: 'Create Item',
        onClick: noop,
      }}
    />
  ),
};

/**
 * Small size
 */
export const Small: Story = {
  render: () => (
    <EmptyState
      icon={VideoIcon}
      title="No videos"
      description="Create your first video."
      size={CardEmptySize.SM}
      action={{
        label: 'Create Video',
        onClick: noop,
      }}
    />
  ),
};

/**
 * Large size
 */
export const Large: Story = {
  render: () => (
    <EmptyState
      icon={InboxIcon}
      title="No content available"
      description="This section is empty. Start by adding some content."
      size={CardEmptySize.LG}
      action={{
        label: 'Get Started',
        onClick: noop,
      }}
    />
  ),
};

/**
 * With secondary action variant
 */
export const SecondaryAction: Story = {
  render: () => (
    <EmptyState
      icon={PlusIcon}
      title="No projects"
      description="Create your first project to get started."
      action={{
        label: 'New Project',
        onClick: noop,
        variant: ButtonVariant.SECONDARY,
      }}
    />
  ),
};

/**
 * With outline action variant
 */
export const OutlineAction: Story = {
  render: () => (
    <EmptyState
      icon={PhotoIcon}
      title="No gallery items"
      description="Add images to your gallery."
      action={{
        label: 'Upload Images',
        onClick: noop,
        variant: ButtonVariant.OUTLINE,
      }}
    />
  ),
};

/**
 * EmptyStateCard variant
 */
export const Card: Story = {
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <EmptyStateCard
      icon={InboxIcon}
      title="No items found"
      description="Get started by creating your first item."
      action={{
        label: 'Create Item',
        onClick: noop,
      }}
    />
  ),
};

/**
 * All sizes comparison
 */
export const SizeComparison: Story = {
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="space-y-12 p-8">
      <EmptyState
        icon={InboxIcon}
        title="Small Empty State"
        description="This is the small size variant."
        size={CardEmptySize.SM}
        action={{ label: 'Create Item', onClick: noop }}
      />
      <EmptyState
        icon={InboxIcon}
        title="Default Empty State"
        description="This is the default size variant."
        size={CardEmptySize.DEFAULT}
        action={{ label: 'Create Item', onClick: noop }}
      />
      <EmptyState
        icon={InboxIcon}
        title="Large Empty State"
        description="This is the large size variant."
        size={CardEmptySize.LG}
        action={{ label: 'Create Item', onClick: noop }}
      />
    </div>
  ),
};

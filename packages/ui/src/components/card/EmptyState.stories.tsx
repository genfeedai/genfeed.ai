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

/**
 * EmptyState component displays a message when there's no data to show.
 * Supports icons, labels, descriptions, and action buttons.
 */
const meta = {
  argTypes: {
    action: {
      control: 'object',
      description: 'Action button configuration',
    },
    description: {
      control: 'text',
      description: 'Description text',
    },
    icon: {
      description: 'Icon element to display',
    },
    label: {
      control: 'text',
      description: 'Main label text',
    },
    size: {
      control: 'select',
      description: 'Size variant',
      options: ['sm', 'default', 'lg'],
    },
    variant: {
      control: 'select',
      description: 'Visual variant',
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
      label="No items found"
      description="Get started by creating your first item."
      action={{
        label: 'Create Item',
        onClick: () => {
          // Action clicked
        },
      }}
    />
  ),
};

/**
 * Without action button
 */
export const NoAction: Story = {
  render: () => (
    <EmptyState
      icon={PhotoIcon}
      label="No images yet"
      description="Upload your first image to get started."
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
      label="No videos"
      description="Create your first video."
      size={CardEmptySize.SM}
      action={{
        label: 'Create Video',
        onClick: () => {
          // Action clicked
        },
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
      label="No content available"
      description="This section is empty. Start by adding some content."
      size={CardEmptySize.LG}
      action={{
        label: 'Get Started',
        onClick: () => {
          // Action clicked
        },
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
      label="No projects"
      description="Create your first project to get started."
      action={{
        label: 'New Project',
        onClick: () => {
          // Action clicked
        },
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
      label="No gallery items"
      description="Add images to your gallery."
      action={{
        label: 'Upload Images',
        onClick: () => {
          // Action clicked
        },
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
      label="No items found"
      description="Get started by creating your first item."
      action={{
        label: 'Create Item',
        onClick: () => {
          // Action clicked
        },
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
        label="Small Empty State"
        description="This is the small size variant."
        size={CardEmptySize.SM}
      />
      <EmptyState
        icon={InboxIcon}
        label="Default Empty State"
        description="This is the default size variant."
        size={CardEmptySize.DEFAULT}
      />
      <EmptyState
        icon={InboxIcon}
        label="Large Empty State"
        description="This is the large size variant."
        size={CardEmptySize.LG}
      />
    </div>
  ),
};

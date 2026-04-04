import { ComponentSize } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import Badge from '@ui/display/badge/Badge';
import {
  HiCheckCircle,
  HiClock,
  HiExclamationCircle,
  HiFire,
  HiStar,
} from 'react-icons/hi2';

/**
 * Badge component for displaying status, counts, or labels.
 * Supports multiple variants, sizes, and optional icons.
 */
const meta = {
  argTypes: {
    size: {
      control: 'select',
      description: 'Badge size',
      options: ['sm', 'md', 'lg'],
    },
    value: {
      control: 'number',
      description: 'Numeric value to display',
    },
    variant: {
      control: 'select',
      description: 'Badge color variant',
      options: [
        'default',
        'primary',
        'secondary',
        'accent',
        'info',
        'success',
        'warning',
        'error',
        'outline',
        'ghost',
      ],
    },
  },
  component: Badge,
  parameters: {
    docs: {
      description: {
        component:
          'Versatile badge component for status indicators, notification counts, labels, and tags.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/UI/Badge',
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default badge
 */
export const Default: Story = {
  args: {
    children: 'Default',
    variant: 'default',
  },
};

/**
 * Primary variant
 */
export const Primary: Story = {
  args: {
    children: 'Primary',
    variant: 'primary',
  },
};

/**
 * Secondary variant
 */
export const Secondary: Story = {
  args: {
    children: 'Secondary',
    variant: 'secondary',
  },
};

/**
 * Success status badge
 */
export const Success: Story = {
  render: () => (
    <Badge variant="success" icon={<HiCheckCircle />}>
      Active
    </Badge>
  ),
};

/**
 * Warning status badge
 */
export const Warning: Story = {
  render: () => (
    <Badge variant="warning" icon={<HiClock />}>
      Pending
    </Badge>
  ),
};

/**
 * Error status badge
 */
export const Error: Story = {
  render: () => (
    <Badge variant="error" icon={<HiExclamationCircle />}>
      Failed
    </Badge>
  ),
};

/**
 * Info badge
 */
export const Info: Story = {
  args: {
    children: 'New',
    variant: 'info',
  },
};

/**
 * Outline variant
 */
export const Outline: Story = {
  args: {
    children: 'Outline',
    variant: 'outline',
  },
};

/**
 * Ghost variant
 */
export const Ghost: Story = {
  args: {
    children: 'Ghost',
    variant: 'ghost',
  },
};

/**
 * Small size
 */
export const Small: Story = {
  args: {
    children: 'Small',
    size: ComponentSize.SM,
    variant: 'primary',
  },
};

/**
 * Medium size (default)
 */
export const Medium: Story = {
  args: {
    children: 'Medium',
    size: ComponentSize.MD,
    variant: 'primary',
  },
};

/**
 * Large size
 */
export const Large: Story = {
  args: {
    children: 'Large',
    size: ComponentSize.LG,
    variant: 'primary',
  },
};

/**
 * Badge with icon
 */
export const WithIcon: Story = {
  render: () => (
    <Badge variant="accent" icon={<HiStar />}>
      Featured
    </Badge>
  ),
};

/**
 * Notification count badge
 */
export const NotificationCount: Story = {
  args: {
    value: 42,
    variant: 'error',
  },
};

/**
 * Badge with zero value (hidden)
 */
export const ZeroValue: Story = {
  args: {
    value: 0,
    variant: 'primary',
  },
  parameters: {
    docs: {
      description: {
        story: 'Badges with value of 0 are not rendered (returns null)',
      },
    },
  },
};

/**
 * Trending badge
 */
export const Trending: Story = {
  render: () => (
    <Badge variant="warning" icon={<HiFire />}>
      Trending
    </Badge>
  ),
};

/**
 * All variants showcase
 */
export const AllVariants: Story = {
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="flex flex-wrap gap-3 p-4">
      <Badge variant="default">Default</Badge>
      <Badge variant="primary">Primary</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="accent">Accent</Badge>
      <Badge variant="info">Info</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="error">Error</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="ghost">Ghost</Badge>
    </div>
  ),
};

/**
 * All sizes showcase
 */
export const AllSizes: Story = {
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="flex items-center gap-3 p-4">
      <Badge variant="primary" size={ComponentSize.SM}>
        Small
      </Badge>
      <Badge variant="primary" size={ComponentSize.MD}>
        Medium
      </Badge>
      <Badge variant="primary" size={ComponentSize.LG}>
        Large
      </Badge>
    </div>
  ),
};

/**
 * Status badges example
 */
export const StatusBadges: Story = {
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="flex flex-wrap gap-3 p-4">
      <Badge variant="success" icon={<HiCheckCircle />}>
        Published
      </Badge>
      <Badge variant="warning" icon={<HiClock />}>
        Draft
      </Badge>
      <Badge variant="error" icon={<HiExclamationCircle />}>
        Error
      </Badge>
      <Badge variant="info">Processing</Badge>
      <Badge variant="ghost">Archived</Badge>
    </div>
  ),
};

/**
 * Platform badges example
 */
export const PlatformBadges: Story = {
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="flex flex-wrap gap-2 p-4">
      <Badge variant="primary" size={ComponentSize.SM}>
        TikTok
      </Badge>
      <Badge variant="error" size={ComponentSize.SM}>
        YouTube
      </Badge>
      <Badge variant="accent" size={ComponentSize.SM}>
        Instagram
      </Badge>
      <Badge variant="info" size={ComponentSize.SM}>
        Twitter
      </Badge>
      <Badge variant="secondary" size={ComponentSize.SM}>
        LinkedIn
      </Badge>
    </div>
  ),
};

/**
 * Notification badges on UI elements
 */
export const OnUIElements: Story = {
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="flex gap-8 p-4">
      <div className="relative">
        <button className="inline-flex items-center justify-center gap-2 h-9 px-4 py-2 text-sm font-black bg-secondary text-secondary-foreground shadow-sm hover:bg-accent hover:text-accent-foreground">
          Inbox
          <Badge
            value={5}
            variant="error"
            size={ComponentSize.SM}
            className="absolute -top-2 -right-2"
          />
        </button>
      </div>

      <div className="relative">
        <button className="inline-flex items-center justify-center gap-2 h-9 px-4 py-2 text-sm font-black bg-secondary text-secondary-foreground shadow-sm hover:bg-accent hover:text-accent-foreground">
          Notifications
          <Badge
            value={23}
            variant="warning"
            size={ComponentSize.SM}
            className="absolute -top-2 -right-2"
          />
        </button>
      </div>
    </div>
  ),
};

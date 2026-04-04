import type { Meta, StoryObj } from '@storybook/nextjs';
import Breadcrumb from '@ui/navigation/breadcrumb/Breadcrumb';

/**
 * Breadcrumb component displays navigation path.
 * Can use pathname automatically or custom segments.
 */
const meta = {
  argTypes: {
    className: {
      control: 'text',
      description: 'Additional CSS classes',
    },
    segments: {
      control: 'object',
      description:
        'Custom breadcrumb segments (optional, uses pathname if not provided)',
    },
  },
  component: Breadcrumb,
  parameters: {
    docs: {
      description: {
        component:
          'Breadcrumb navigation component for displaying page hierarchy.',
      },
    },
    layout: 'centered',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/dashboard/settings/profile',
      },
    },
  },
  tags: ['autodocs'],
  title: 'Components/UI/Breadcrumb',
} satisfies Meta<typeof Breadcrumb>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default breadcrumb (uses pathname)
 */
export const Default: Story = {
  args: {
    segments: undefined,
  },
  parameters: {
    layout: 'padded',
  },
};

/**
 * Custom segments
 */
export const CustomSegments: Story = {
  args: {
    segments: [
      { href: '/', label: 'Home' },
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/dashboard/settings', label: 'Settings' },
      { href: '/dashboard/settings/profile', label: 'Profile' },
    ],
  },
  parameters: {
    layout: 'padded',
  },
};

/**
 * Simple breadcrumb
 */
export const Simple: Story = {
  args: {
    segments: [
      { href: '/', label: 'Home' },
      { href: '/about', label: 'About' },
    ],
  },
  parameters: {
    layout: 'padded',
  },
};

/**
 * Long breadcrumb
 */
export const Long: Story = {
  args: {
    segments: [
      { href: '/', label: 'Home' },
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/dashboard/projects', label: 'Projects' },
      { href: '/dashboard/projects/123', label: 'Project Details' },
      { href: '/dashboard/projects/123/settings', label: 'Settings' },
      {
        href: '/dashboard/projects/123/settings/permissions',
        label: 'Permissions',
      },
    ],
  },
  parameters: {
    layout: 'padded',
  },
};

/**
 * Single segment
 */
export const SingleSegment: Story = {
  args: {
    segments: [{ href: '/dashboard', label: 'Dashboard' }],
  },
  parameters: {
    layout: 'padded',
  },
};

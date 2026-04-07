import type { Meta, StoryObj } from '@storybook/nextjs';
import AppLink from '@ui/navigation/link/Link';

/**
 * AppLink component wraps Next.js Link with button styling.
 */
const meta = {
  component: AppLink,
  parameters: {
    docs: {
      description: {
        component:
          'Link component that combines Next.js navigation with button styling.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/UI/Link',
} satisfies Meta<typeof AppLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Basic link
 */
export const Basic: Story = {
  args: {
    label: 'Go to Dashboard',
    url: '/dashboard',
  },
};

/**
 * Primary styled link
 */
export const Primary: Story = {
  args: {
    className: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
    label: 'Primary Link',
    url: '/dashboard',
  },
};

/**
 * Secondary styled link (default)
 */
export const Secondary: Story = {
  args: {
    className:
      'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
    label: 'Secondary Link',
    url: '/dashboard',
  },
};

/**
 * Link while submitting
 */
export const Submitting: Story = {
  args: {
    className: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
    isSubmitting: true,
    label: 'Submitting',
    url: '/dashboard',
  },
};

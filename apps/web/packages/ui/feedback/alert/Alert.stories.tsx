import { AlertCategory } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import Alert from '@ui/feedback/alert/Alert';
import { useState } from 'react';
import { HiLightBulb } from 'react-icons/hi2';

/**
 * Alert component for displaying important messages to users.
 * Supports different types (info, success, warning, error) with optional close button.
 */
const meta = {
  argTypes: {
    className: {
      control: 'text',
      description: 'Additional CSS classes',
    },
    onClose: {
      action: 'closed',
      description: 'Callback when close button is clicked',
    },
    type: {
      control: 'select',
      description: 'Alert type determines icon and styling',
      options: Object.values(AlertCategory),
    },
  },
  component: Alert,
  parameters: {
    docs: {
      description: {
        component:
          'Alert component for displaying notifications, warnings, errors, and success messages with appropriate styling and icons.',
      },
    },
    layout: 'padded',
  },
  tags: ['autodocs'],
  title: 'Components/UI/Alert',
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Info alert for general information
 */
export const Info: Story = {
  args: {
    children: 'This is an informational message. Please read carefully.',
    type: AlertCategory.INFO,
  },
};

/**
 * Success alert for positive feedback
 */
export const Success: Story = {
  args: {
    children: 'Your changes have been saved successfully!',
    type: AlertCategory.SUCCESS,
  },
};

/**
 * Warning alert for caution messages
 */
export const Warning: Story = {
  args: {
    children: 'Please review your settings before continuing.',
    type: AlertCategory.WARNING,
  },
};

/**
 * Error alert for error messages
 */
export const Error: Story = {
  args: {
    children: 'An error occurred. Please try again.',
    type: AlertCategory.ERROR,
  },
};

/**
 * Alert with close button
 */
export const Closeable: Story = {
  args: {
    children: 'This alert can be dismissed.',
    onClose: () => alert('Alert closed!'),
    type: AlertCategory.INFO,
  },
};

/**
 * Alert with custom icon
 */
export const CustomIcon: Story = {
  args: {
    children: 'Alert content',
  },
  render: () => (
    <Alert type={AlertCategory.INFO} icon={<HiLightBulb />}>
      Pro tip: You can customize the icon!
    </Alert>
  ),
};

/**
 * Long content alert
 */
export const LongContent: Story = {
  args: {
    children: (
      <div>
        <strong>Important Notice:</strong> Your account will be upgraded to the
        premium plan. This includes unlimited storage, priority support, and
        advanced features. The changes will take effect immediately.
      </div>
    ),
    onClose: () => {},
    type: AlertCategory.WARNING,
  },
};

/**
 * Alert with formatted content
 */
export const FormattedContent: Story = {
  args: {
    children: (
      <div className="space-y-2">
        <div className="font-semibold">Video Generated Successfully!</div>
        <ul className="list-disc list-inside text-sm">
          <li>Duration: 30 seconds</li>
          <li>Resolution: 1080p</li>
          <li>Format: MP4</li>
        </ul>
      </div>
    ),
    type: AlertCategory.SUCCESS,
  },
};

/**
 * Showcase all alert types
 */
export const AllTypes: Story = {
  args: {
    children: 'Info: This is an informational message',
    type: AlertCategory.INFO,
  },
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="space-y-4 w-full max-w-2xl">
      <Alert type={AlertCategory.INFO}>
        Info: This is an informational message
      </Alert>
      <Alert type={AlertCategory.SUCCESS}>
        Success: Your operation completed successfully
      </Alert>
      <Alert type={AlertCategory.WARNING}>
        Warning: Please review before proceeding
      </Alert>
      <Alert type={AlertCategory.ERROR}>Error: Something went wrong</Alert>
    </div>
  ),
};

/**
 * Interactive example with state
 */
export const Interactive: Story = {
  args: {
    children: 'You can close this alert and show it again!',
    type: AlertCategory.INFO,
  },
  render: () => {
    const [visible, setVisible] = useState(true);

    if (!visible) {
      return (
        <button
          onClick={() => setVisible(true)}
          className="inline-flex items-center justify-center gap-2 h-9 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground shadow hover:bg-primary/90"
        >
          Show Alert Again
        </button>
      );
    }

    return (
      <Alert
        type={AlertCategory.INFO}
        className="bg-info/10 text-info"
        onClose={() => setVisible(false)}
      >
        You can close this alert and show it again!
      </Alert>
    );
  },
};

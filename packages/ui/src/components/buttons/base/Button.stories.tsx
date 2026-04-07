import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import Button from '@ui/buttons/base/Button';
import { FiDownload, FiSave, FiTrash2, FiUpload } from 'react-icons/fi';

/**
 * The Button component is the primary interactive element in the Genfeed design system.
 * It supports various states including loading, disabled, and ping indicator.
 */
const meta = {
  argTypes: {
    className: {
      control: 'text',
      description: 'Additional CSS classes for custom styling',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Disables button interaction',
    },
    isLoading: {
      control: 'boolean',
      description: 'Shows loading spinner when true',
    },
    isPingEnabled: {
      control: 'boolean',
      description: 'Shows animated ping indicator',
    },
    label: {
      control: 'text',
      description: 'Button label text',
    },
    tooltipPosition: {
      control: 'select',
      description: 'Tooltip position',
      options: ['top', 'bottom', 'left', 'right'],
    },
    type: {
      control: 'select',
      description: 'Button HTML type attribute',
      options: ['button', 'submit'],
    },
  },
  component: Button,
  parameters: {
    docs: {
      description: {
        component:
          'A versatile button component with support for icons, tooltips, loading states, and accessibility features.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Buttons/Button',
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default button with primary styling
 */
export const Primary: Story = {
  args: {
    label: 'Primary Button',
    variant: ButtonVariant.DEFAULT,
  },
};

/**
 * Secondary button variant
 */
export const Secondary: Story = {
  args: {
    label: 'Secondary Button',
    variant: ButtonVariant.SECONDARY,
  },
};

/**
 * Accent button variant
 */
export const Accent: Story = {
  args: {
    label: 'Accent Button',
    variant: ButtonVariant.DEFAULT,
  },
};

/**
 * Button with an icon
 */
export const WithIcon: Story = {
  render: () => (
    <Button label="Save" icon={<FiSave />} variant={ButtonVariant.DEFAULT} />
  ),
};

/**
 * Icon-only button (no label)
 */
export const IconOnly: Story = {
  render: () => (
    <Button
      label=""
      icon={<FiTrash2 />}
      variant={ButtonVariant.DESTRUCTIVE}
      size={ButtonSize.SM}
      ariaLabel="Delete"
    />
  ),
};

/**
 * Loading state shows spinner
 */
export const Loading: Story = {
  args: {
    isLoading: true,
    label: 'Processing',
    variant: ButtonVariant.DEFAULT,
  },
};

/**
 * Disabled state prevents interaction
 */
export const Disabled: Story = {
  args: {
    isDisabled: true,
    label: 'Disabled Button',
    variant: ButtonVariant.DEFAULT,
  },
};

/**
 * Button with tooltip on hover
 */
export const WithTooltip: Story = {
  args: {
    label: 'Hover Me',
    tooltip: 'This is a helpful tooltip\nthat explains the button action',
    tooltipPosition: 'top',
    variant: ButtonVariant.DEFAULT,
  },
};

/**
 * Button with ping indicator (for notifications)
 */
export const WithPing: Story = {
  args: {
    isPingEnabled: true,
    label: 'Notifications',
    variant: ButtonVariant.GHOST,
  },
};

/**
 * Small button size
 */
export const Small: Story = {
  args: {
    label: 'Small Button',
    size: ButtonSize.SM,
    variant: ButtonVariant.DEFAULT,
  },
};

/**
 * Large button size
 */
export const Large: Story = {
  args: {
    label: 'Large Button',
    size: ButtonSize.LG,
    variant: ButtonVariant.DEFAULT,
  },
};

/**
 * Wide button
 */
export const Wide: Story = {
  args: {
    className: 'w-48',
    label: 'Wide Button',
    variant: ButtonVariant.DEFAULT,
  },
};

/**
 * Block (full width) button
 */
export const Block: Story = {
  args: {
    className: 'w-full',
    label: 'Block Button',
    variant: ButtonVariant.DEFAULT,
  },
  parameters: {
    layout: 'padded',
  },
};

/**
 * Ghost button variant
 */
export const Ghost: Story = {
  args: {
    label: 'Ghost Button',
    variant: ButtonVariant.GHOST,
  },
};

/**
 * Outline button variant
 */
export const Outline: Story = {
  args: {
    label: 'Outline Button',
    variant: ButtonVariant.OUTLINE,
  },
};

/**
 * Success button for positive actions
 */
export const Success: Story = {
  render: () => (
    <Button
      label="Confirm"
      icon={<FiSave />}
      variant={ButtonVariant.DEFAULT}
      className="bg-success text-success-foreground hover:bg-success/90"
    />
  ),
};

/**
 * Error/danger button for destructive actions
 */
export const Error: Story = {
  render: () => (
    <Button
      label="Delete"
      icon={<FiTrash2 />}
      variant={ButtonVariant.DESTRUCTIVE}
    />
  ),
};

/**
 * Warning button
 */
export const Warning: Story = {
  args: {
    className: 'bg-warning text-warning-foreground hover:bg-warning/90',
    label: 'Warning',
    variant: ButtonVariant.DEFAULT,
  },
};

/**
 * Info button
 */
export const Info: Story = {
  args: {
    className: 'bg-info text-info-foreground hover:bg-info/90',
    label: 'More Info',
    variant: ButtonVariant.DEFAULT,
  },
};

/**
 * Download button example
 */
export const Download: Story = {
  render: () => (
    <Button
      label="Download"
      icon={<FiDownload />}
      variant={ButtonVariant.DEFAULT}
      tooltip="Download file"
    />
  ),
};

/**
 * Upload button example
 */
export const Upload: Story = {
  render: () => (
    <Button
      label="Upload"
      icon={<FiUpload />}
      variant={ButtonVariant.SECONDARY}
    />
  ),
};

/**
 * Interactive example showing all states
 */
export const AllStates: Story = {
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="flex flex-wrap gap-4 p-8">
      <Button label="Primary" variant={ButtonVariant.DEFAULT} />
      <Button label="Secondary" variant={ButtonVariant.SECONDARY} />
      <Button label="Accent" variant={ButtonVariant.DEFAULT} />
      <Button label="Ghost" variant={ButtonVariant.GHOST} />
      <Button
        label="With Icon"
        icon={<FiSave />}
        variant={ButtonVariant.DEFAULT}
      />
      <Button label="Loading" isLoading variant={ButtonVariant.DEFAULT} />
      <Button label="Disabled" isDisabled variant={ButtonVariant.DEFAULT} />
      <Button label="With Ping" isPingEnabled variant={ButtonVariant.GHOST} />
    </div>
  ),
};

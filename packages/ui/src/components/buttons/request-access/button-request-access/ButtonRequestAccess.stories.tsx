import { ButtonVariant } from '@genfeedai/contracts';
import type { Meta, StoryObj } from '@storybook/nextjs';
import ButtonRequestAccess from '@ui/buttons/request-access/button-request-access/ButtonRequestAccess';

/**
 * ButtonRequestAccess component displays a button that links to the signup flow.
 * Supports multiple variants and custom styling.
 */
const meta = {
  argTypes: {
    className: {
      control: 'text',
      description: 'Additional CSS classes',
    },
    label: {
      control: 'text',
      description: 'Button label text',
    },
    variant: {
      control: 'select',
      description: 'Button variant style',
      options: ['primary', 'secondary', 'white', 'black'],
    },
  },
  component: ButtonRequestAccess,
  parameters: {
    docs: {
      description: {
        component:
          'Button component for creating a free account. Links to the signup flow.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Buttons/ButtonRequestAccess',
} satisfies Meta<typeof ButtonRequestAccess>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default primary button
 */
export const Primary: Story = {
  args: {
    label: 'Create free account',
    variant: ButtonVariant.DEFAULT,
  },
};

/**
 * Secondary variant
 */
export const Secondary: Story = {
  args: {
    label: 'Create free account',
    variant: ButtonVariant.SECONDARY,
  },
};

/**
 * Custom label
 */
export const CustomLabel: Story = {
  args: {
    label: 'Get Started Today',
    variant: ButtonVariant.DEFAULT,
  },
};

/**
 * All variants comparison
 */
export const AllVariants: Story = {
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="space-y-4 p-8">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Primary</h3>
        <ButtonRequestAccess
          label="Create free account"
          variant={ButtonVariant.DEFAULT}
        />
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Secondary</h3>
        <ButtonRequestAccess
          label="Create free account"
          variant={ButtonVariant.SECONDARY}
        />
      </div>
    </div>
  ),
};

import { ButtonVariant } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import ButtonRequestAccess from '@ui/buttons/request-access/button-request-access/ButtonRequestAccess';

/**
 * ButtonRequestAccess component displays a button that links to the request access page.
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
          'Button component for requesting access to the platform. Links to the request access page.',
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
    label: 'Request Access',
    variant: ButtonVariant.DEFAULT,
  },
};

/**
 * Secondary variant
 */
export const Secondary: Story = {
  args: {
    label: 'Request Access',
    variant: ButtonVariant.SECONDARY,
  },
};

/**
 * White variant
 */
export const White: Story = {
  args: {
    label: 'Request Access',
    variant: ButtonVariant.WHITE,
  },
  decorators: [
    (Story) => (
      <div className="bg-gradient-to-br from-primary to-secondary p-8">
        <Story />
      </div>
    ),
  ],
};

/**
 * Black variant
 */
export const Black: Story = {
  args: {
    label: 'Request Access',
    variant: ButtonVariant.BLACK,
  },
  decorators: [
    (Story) => (
      <div className="bg-gray-100 p-8">
        <Story />
      </div>
    ),
  ],
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
          label="Request Access"
          variant={ButtonVariant.DEFAULT}
        />
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Secondary</h3>
        <ButtonRequestAccess
          label="Request Access"
          variant={ButtonVariant.SECONDARY}
        />
      </div>
      <div className="space-y-2 bg-gradient-to-br from-primary to-secondary p-4">
        <h3 className="text-sm font-semibold text-white">
          White (on gradient)
        </h3>
        <ButtonRequestAccess
          label="Request Access"
          variant={ButtonVariant.WHITE}
        />
      </div>
      <div className="space-y-2 bg-gray-100 p-4">
        <h3 className="text-sm font-semibold">Black (on light)</h3>
        <ButtonRequestAccess
          label="Request Access"
          variant={ButtonVariant.BLACK}
        />
      </div>
    </div>
  ),
};

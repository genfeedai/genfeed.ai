import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import Button from '@ui/buttons/base/Button';
import PricingToggle from '@ui/pricing/toggle/PricingToggle';
import { useState } from 'react';

/**
 * PricingToggle component allows users to switch between monthly and yearly pricing.
 */
const meta = {
  argTypes: {
    isYearly: {
      control: 'boolean',
      description: 'Whether yearly pricing is selected',
    },
    setIsYearly: {
      action: 'toggled',
      description: 'Callback when toggle is changed',
    },
  },
  component: PricingToggle,
  parameters: {
    docs: {
      description: {
        component:
          'Toggle component for switching between monthly and yearly pricing plans with visual feedback.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pricing/PricingToggle',
} satisfies Meta<typeof PricingToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default toggle with monthly selected
 */
export const Monthly: Story = {
  args: {
    isYearly: false,
    setIsYearly: () => {
      // Toggle changed
    },
  },
};

/**
 * Toggle with yearly selected
 */
export const Yearly: Story = {
  args: {
    isYearly: true,
    setIsYearly: () => {
      // Toggle changed
    },
  },
};

/**
 * Interactive toggle example
 */
export const Interactive: Story = {
  args: {
    isYearly: false,
    setIsYearly: () => {},
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [isYearly, setIsYearly] = useState(false);

    return (
      <div className="space-y-6 p-8">
        <PricingToggle isYearly={isYearly} setIsYearly={setIsYearly} />
        <div className="text-center text-sm text-gray-600">
          Currently selected: {isYearly ? 'Yearly' : 'Monthly'}
        </div>
      </div>
    );
  },
};

/**
 * Toggle in pricing page context
 */
export const InContext: Story = {
  args: {
    isYearly: false,
    setIsYearly: () => {},
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [isYearly, setIsYearly] = useState(false);

    return (
      <div className="space-y-8 p-8 bg-background">
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-2">Choose Your Plan</h2>
          <p className="text-gray-600 mb-6">
            Select the plan that works best for you
          </p>
          <PricingToggle isYearly={isYearly} setIsYearly={setIsYearly} />
        </div>

        <div className="flex justify-center gap-4 mt-8">
          <div className=" border border-white/[0.08] bg-card w-64 p-6 text-center">
            <h3 className="text-xl font-bold mb-2">Starter</h3>
            <div className="text-3xl font-bold mb-4">
              ${isYearly ? '99' : '9.99'}
              <span className="text-base font-normal">
                /{isYearly ? 'year' : 'month'}
              </span>
            </div>
            <Button
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              className="w-full"
            >
              Subscribe
            </Button>
          </div>

          <div className=" border-2 border-primary bg-card w-64 p-6 text-center">
            <span className="inline-flex items-center rounded-full bg-success px-2.5 py-0.5 text-xs font-semibold text-success-foreground mb-2">
              Most Popular
            </span>
            <h3 className="text-xl font-bold mb-2">Professional</h3>
            <div className="text-3xl font-bold mb-4">
              ${isYearly ? '287.99' : '29.99'}
              <span className="text-base font-normal">
                /{isYearly ? 'year' : 'month'}
              </span>
            </div>
            <Button
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              className="w-full"
            >
              Subscribe
            </Button>
          </div>

          <div className=" border border-white/[0.08] bg-card w-64 p-6 text-center">
            <h3 className="text-xl font-bold mb-2">Enterprise</h3>
            <div className="text-3xl font-bold mb-4">
              ${isYearly ? '959.99' : '99.99'}
              <span className="text-base font-normal">
                /{isYearly ? 'year' : 'month'}
              </span>
            </div>
            <Button
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              className="w-full"
            >
              Subscribe
            </Button>
          </div>
        </div>
      </div>
    );
  },
};

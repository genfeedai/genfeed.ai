import type { Meta, StoryObj } from '@storybook/nextjs';
import PricingSubscriptions from '@ui/pricing/subscriptions/PricingSubscriptions';

/**
 * PricingSubscriptions component displays a grid of pricing plans
 * with monthly/yearly toggle.
 */
const meta = {
  argTypes: {
    onSubscribe: {
      action: 'subscribed',
      description: 'Callback when user subscribes',
    },
    subscription: {
      control: 'object',
      description: 'Current subscription object',
    } as any,
  },
  component: PricingSubscriptions,
  parameters: {
    docs: {
      description: {
        component:
          'Component displaying all pricing plans with monthly/yearly toggle.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pricing/PricingSubscriptions',
} satisfies Meta<typeof PricingSubscriptions>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default pricing subscriptions
 */
export const Default: Story = {
  args: {
    onSubscribe: () => {
      // Subscribe action
    },
    subscription: undefined,
  },
  parameters: {
    layout: 'fullscreen',
  },
};

/**
 * With active subscription
 */
export const WithActiveSubscription: Story = {
  args: {
    onSubscribe: () => {
      // Subscribe action
    },
    subscription: {
      category: 'monthly',
      id: 'sub1',
      status: 'active',
      stripePriceId: 'price_monthly',
    } as any,
  },
  parameters: {
    layout: 'fullscreen',
  },
};

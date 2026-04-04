import type { Meta, StoryObj } from '@storybook/nextjs';
import PricingCard from '@ui/pricing/card/PricingCard';

/**
 * PricingCard component displays a subscription plan with features,
 * pricing, and subscription actions.
 */
const meta = {
  argTypes: {
    buttonLabel: {
      control: 'text',
      description: 'Label for the subscribe button',
    },
    onSubscribe: {
      action: 'subscribed',
      description: 'Callback when user subscribes to a plan',
    },
    plan: {
      control: 'object',
      description:
        'Pricing plan object with label, price, outputs, features, etc.',
    } as any,
    subscription: {
      control: 'object',
      description: 'Current subscription object (if user is subscribed)',
    } as any,
  },
  component: PricingCard,
  parameters: {
    docs: {
      description: {
        component:
          'Card component for displaying pricing plans with features, outputs, and subscription actions.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pricing/PricingCard',
} satisfies Meta<typeof PricingCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Basic pricing card
 */
export const Basic: Story = {
  args: {
    buttonLabel: 'Subscribe',
    onSubscribe: (_plan) => {
      // Subscribe action
    },
    plan: {
      description: 'Perfect for getting started',
      features: [
        '1,000 outputs per month',
        'Basic support',
        'Access to standard templates',
      ],
      id: '1',
      interval: 'month',
      label: 'Starter',
      outputs: { images: 500, videos: 10, voiceMinutes: 15 },
      price: 9.99,
      type: 'subscription',
    } as any,
  },
};

/**
 * Professional plan (most popular)
 */
export const Professional: Story = {
  args: {
    buttonLabel: 'Subscribe',
    onSubscribe: (_plan) => {
      // Subscribe action
    },
    plan: {
      description: 'For professionals and teams',
      features: [
        '30 videos per month',
        'Priority support',
        'Access to all templates',
        'Advanced analytics',
        'Team collaboration',
      ],
      id: '2',
      interval: 'month',
      label: 'Professional',
      outputs: { images: 2000, videos: 30, voiceMinutes: 60 },
      price: 29.99,
      type: 'subscription',
    } as any,
  },
};

/**
 * Enterprise plan
 */
export const Enterprise: Story = {
  args: {
    buttonLabel: 'Contact Sales',
    onSubscribe: (_plan) => {
      // Subscribe action
    },
    plan: {
      description: 'For large organizations',
      features: [
        'Unlimited videos',
        '24/7 dedicated support',
        'Custom templates',
        'Advanced analytics',
        'Team collaboration',
        'Custom integrations',
        'SLA guarantee',
      ],
      id: '3',
      interval: 'month',
      label: 'Enterprise',
      outputs: { images: 10000, videos: 500, voiceMinutes: 500 },
      price: 99.99,
      type: 'subscription',
    } as any,
  },
};

/**
 * Yearly subscription
 */
export const Yearly: Story = {
  args: {
    buttonLabel: 'Subscribe',
    onSubscribe: (_plan) => {
      // Subscribe action
    },
    plan: {
      description: 'For professionals and teams',
      features: [
        '30 videos per month',
        'Priority support',
        'Access to all templates',
        'Advanced analytics',
        'Team collaboration',
      ],
      id: '4',
      interval: 'year',
      label: 'Professional',
      outputs: { images: 2000, videos: 30, voiceMinutes: 60 },
      price: 287.99,
      type: 'subscription',
    } as any,
  },
};

/**
 * Current active subscription
 */
export const ActiveSubscription: Story = {
  args: {
    buttonLabel: 'Subscribe',
    onSubscribe: (_plan) => {
      // Subscribe action
    },
    plan: {
      description: 'For professionals and teams',
      features: [
        '30 videos per month',
        'Priority support',
        'Access to all templates',
        'Advanced analytics',
        'Team collaboration',
      ],
      id: '2',
      interval: 'month',
      label: 'Professional',
      outputs: { images: 2000, videos: 30, voiceMinutes: 60 },
      price: 29.99,
      type: 'subscription',
    } as any,
    subscription: {
      id: 'sub1',
      planId: '2',
      status: 'active',
    } as any,
  },
};

/**
 * Loading state
 */
export const Loading: Story = {
  args: {
    buttonLabel: 'Subscribe',
    onSubscribe: async (_plan) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // Subscribe action
    },
    plan: {
      description: 'For professionals and teams',
      features: [
        '30 videos per month',
        'Priority support',
        'Access to all templates',
        'Advanced analytics',
        'Team collaboration',
      ],
      id: '2',
      interval: 'month',
      label: 'Professional',
      outputs: { images: 2000, videos: 30, voiceMinutes: 60 },
      price: 29.99,
      type: 'subscription',
    } as any,
  },
};

/**
 * All pricing cards in a grid
 */
export const AllPlans: Story = {
  args: {
    plan: {
      features: [],
      id: '1',
      interval: 'month',
      label: 'Plan',
      price: 0,
      type: 'subscription',
    } as any,
  },
  parameters: {
    layout: 'fullscreen',
  },
  render: () => {
    const plans = [
      {
        description: 'Perfect for getting started',
        features: [
          '10 videos per month',
          'Basic support',
          'Access to standard templates',
        ],
        id: '1',
        interval: 'month' as const,
        label: 'Starter',
        outputs: { images: 500, videos: 10, voiceMinutes: 15 },
        price: 9.99,
        type: 'subscription' as const,
      },
      {
        description: 'For professionals and teams',
        features: [
          '30 videos per month',
          'Priority support',
          'Access to all templates',
          'Advanced analytics',
          'Team collaboration',
        ],
        id: '2',
        interval: 'month' as const,
        label: 'Professional',
        outputs: { images: 2000, videos: 30, voiceMinutes: 60 },
        price: 29.99,
        type: 'subscription' as const,
      },
      {
        description: 'For large organizations',
        features: [
          'Unlimited videos',
          '24/7 dedicated support',
          'Custom templates',
          'Advanced analytics',
          'Team collaboration',
          'Custom integrations',
          'SLA guarantee',
        ],
        id: '3',
        interval: 'month' as const,
        label: 'Enterprise',
        outputs: { images: 10000, videos: 500, voiceMinutes: 500 },
        price: 99.99,
        type: 'subscription' as const,
      },
    ];

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-8 w-full max-w-6xl">
        {plans.map((plan) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            buttonLabel="Subscribe"
            onSubscribe={(_p) => {
              // Subscribe action
            }}
          />
        ))}
      </div>
    );
  },
};

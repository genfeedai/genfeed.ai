import type { Meta, StoryObj } from '@storybook/nextjs';
import SubscriptionPlanChanger from '@ui/subscription/SubscriptionPlanChanger';
import { useState } from 'react';

/**
 * SubscriptionPlanChanger component allows users to preview and change
 * their subscription plan between monthly and yearly.
 */
const meta = {
  argTypes: {
    onChangePlan: {
      action: 'plan changed',
      description: 'Callback when user confirms plan change',
    },
    onPreviewChange: {
      action: 'preview changed',
      description: 'Callback when user previews a plan change',
    },
    subscription: {
      control: 'object',
      description: 'Current subscription object',
    } as any,
  },
  component: SubscriptionPlanChanger,
  parameters: {
    docs: {
      description: {
        component:
          'Component for changing subscription plans with preview functionality.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Subscription/SubscriptionPlanChanger',
} satisfies Meta<typeof SubscriptionPlanChanger>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default with monthly subscription
 */
export const MonthlySubscription: Story = {
  args: {
    onChangePlan: async () => {
      // Plan changed
    },
    onPreviewChange: async (priceId: string) => {
      return {
        isDowngrade: priceId === 'price_monthly',
        isUpgrade: priceId === 'price_yearly',
        prorationAmount: priceId === 'price_yearly' ? 5000 : -5000,
      } as any;
    },
    subscription: {
      category: 'monthly',
      id: 'sub1',
      status: 'active' as any,
      stripePriceId: 'price_monthly',
    } as any,
  },
  parameters: {
    layout: 'padded',
  },
};

/**
 * Yearly subscription
 */
export const YearlySubscription: Story = {
  args: {
    onChangePlan: async () => {
      // Plan changed
    },
    onPreviewChange: async (priceId: string) => {
      return {
        isDowngrade: priceId === 'price_monthly',
        isUpgrade: false,
        prorationAmount: priceId === 'price_monthly' ? -5000 : 0,
      } as any;
    },
    subscription: {
      category: 'yearly',
      id: 'sub2',
      status: 'active' as any,
      stripePriceId: 'price_yearly',
    } as any,
  },
  parameters: {
    layout: 'padded',
  },
};

/**
 * Interactive example
 */
export const Interactive: Story = {
  args: {} as any,
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [currentPlan, setCurrentPlan] = useState<'monthly' | 'yearly'>(
      'monthly',
    );

    return (
      <div className="w-full max-w-2xl p-8">
        <SubscriptionPlanChanger
          subscription={
            {
              category: currentPlan,
              id: 'sub1',
              status: 'active' as any,
              stripePriceId:
                currentPlan === 'monthly' ? 'price_monthly' : 'price_yearly',
            } as any
          }
          onPreviewChange={async (priceId) => {
            const isUpgrade =
              priceId === 'price_yearly' && currentPlan === 'monthly';
            const isDowngrade =
              priceId === 'price_monthly' && currentPlan === 'yearly';
            return {
              isDowngrade,
              isUpgrade,
              prorationAmount: isUpgrade ? 5000 : isDowngrade ? -5000 : 0,
            } as any;
          }}
          onChangePlan={async (priceId) => {
            setCurrentPlan(priceId === 'price_yearly' ? 'yearly' : 'monthly');
          }}
        />
      </div>
    );
  },
};

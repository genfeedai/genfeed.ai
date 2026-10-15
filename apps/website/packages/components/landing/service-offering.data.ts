import { formatPrice } from '@genfeedai/pricing';

const STARTING_MONTHLY_PRICE = 2500;

export const serviceOffering = {
  name: 'Done for you',
  cta: 'Book a call',
  startingMonthlyPrice: STARTING_MONTHLY_PRICE,
  priceLabel: `From ${formatPrice(STARTING_MONTHLY_PRICE)}/month`,
  priceNote: 'Plus model usage at cost and a fee on winners',
  description:
    'Our team plans, produces, and publishes your content and tests it against your best ads. You approve what goes out.',
  includes: [
    'Everything in Agencies',
    'Strategy, production, and publishing by our team',
    'Model usage billed at cost',
    'Creative testing against your best ads',
    'Performance fee on winning creatives, capped',
    'Monthly results per creative',
  ],
  process: [
    {
      step: 'Discovery',
      description: 'Share your goals, audience, and existing content.',
    },
    {
      step: 'Scope',
      description:
        'Agree on deliverables, channels, timing, and review rounds.',
    },
    {
      step: 'Production',
      description: 'Create content in your Genfeed workspace.',
    },
    {
      step: 'Review and publish',
      description: 'Approve the work and publish to your channels.',
    },
  ],
};

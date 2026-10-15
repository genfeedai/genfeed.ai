import { formatPrice } from '@genfeedai/pricing';

const STARTING_MONTHLY_PRICE = 2500;

export const serviceOffering = {
  name: 'Done for you',
  cta: 'Book a call',
  startingMonthlyPrice: STARTING_MONTHLY_PRICE,
  priceLabel: `From ${formatPrice(STARTING_MONTHLY_PRICE)}/month`,
  priceNote: '+ usage at cost + performance fee per contract',
  description:
    'Our team plans, produces, and publishes your content and tests it against your best ads. You approve what goes out.',
  includes: [
    'Everything in Agencies',
    'Our team runs production and publishing',
    'Usage billed at cost',
    'Fee only on winning creatives',
    'Custom LoRA models quoted separately',
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

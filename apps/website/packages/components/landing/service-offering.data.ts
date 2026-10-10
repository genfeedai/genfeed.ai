import { formatPrice } from '@genfeedai/pricing';

const STARTING_MONTHLY_PRICE = 2500;

export const serviceOffering = {
  name: 'Done for you',
  cta: 'Book a call',
  startingMonthlyPrice: STARTING_MONTHLY_PRICE,
  priceLabel: `From ${formatPrice(STARTING_MONTHLY_PRICE)}/month`,
  priceNote: 'Monthly retainer. Final scope agreed on a call.',
  description:
    'You bring the expertise. We handle strategy, production, and publishing. You approve what goes out.',
  includes: [
    'Content strategy and planning',
    'Video, image, and written content',
    'Publishing coordination',
    'Brand kit management',
    'Review and revision rounds agreed in advance',
    'Performance reporting',
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

import {
  AFFILIATE_REWARD_RATE_PERCENT,
  AFFILIATE_REWARD_WINDOW_MONTHS,
  AFFILIATE_SETTLEMENT_DELAY_DAYS,
} from '@genfeedai/contracts/constants';

export interface AffiliateTerm {
  description: string;
  title: string;
}

export interface AffiliateFaqItem {
  answer: string;
  question: string;
}

/**
 * The /affiliates page promises only what billing enforces today (docs/referral-credits.md).
 * Each open decision on #8177 maps to one block below, so changing an answer
 * means editing that block (and the billing code behind it), not the page:
 *
 * - commission rate and duration: AFFILIATE_* constants in @genfeedai/contracts
 * - subscription commission:      `rewardSources`
 * - cash or credits, payout:      `payout`
 * - referred-user discount:       `referredUser`
 * - engine or vendor:             nothing on the page names an engine
 */
export const AFFILIATE_PROGRAM = {
  /** What the referrer earns. */
  earnings: {
    description: `Earn credits equal to ${AFFILIATE_REWARD_RATE_PERCENT}% of what each account you refer spends on credit purchases, for ${AFFILIATE_REWARD_WINDOW_MONTHS} months from the day they sign up.`,
    title: `${AFFILIATE_REWARD_RATE_PERCENT}% in credits, for ${AFFILIATE_REWARD_WINDOW_MONTHS} months`,
  },
  /** Where the referrer finds their link. */
  hubLocation: 'Settings → Affiliates',
  /** How the reward is paid out. */
  payout: {
    description: `Rewards are held for ${AFFILIATE_SETTLEMENT_DELAY_DAYS} days, then added to your credit balance. Credits expire ${AFFILIATE_REWARD_WINDOW_MONTHS} months after they are issued. There are no cash payouts.`,
    title: 'Paid out as credits',
  },
  /** What the referred account gets. */
  referredUser: {
    description:
      'They sign up free through your link. There is no referral discount today.',
    title: 'A free account',
  },
  /** Which purchases earn a reward, and which do not. */
  rewardSources: {
    earns: 'Pay-as-you-go credit purchases (net of tax)',
    excludes:
      'Subscription charges, managed inference, and marketplace purchases',
  },
} as const;

export const AFFILIATE_STEPS: readonly AffiliateTerm[] = [
  {
    description: `Open ${AFFILIATE_PROGRAM.hubLocation} in a billing organization and copy your link.`,
    title: 'Get your link',
  },
  {
    description:
      'Share it anywhere. When someone signs up through it and creates their account, the code is attached to them for good.',
    title: 'Share it',
  },
  {
    description: `Each time they buy credits, you earn ${AFFILIATE_REWARD_RATE_PERCENT}% back in credits for ${AFFILIATE_REWARD_WINDOW_MONTHS} months.`,
    title: 'Earn credits',
  },
] as const;

export const AFFILIATE_FAQ: readonly AffiliateFaqItem[] = [
  {
    answer: `Rewards are credits, not cash. They are pending for ${AFFILIATE_SETTLEMENT_DELAY_DAYS} days, then added to your balance, and they expire ${AFFILIATE_REWARD_WINDOW_MONTHS} months after they are issued.`,
    question: 'Do I get paid in cash?',
  },
  {
    answer:
      'A refund reduces a pending reward. A refund or dispute after the reward was issued takes the matching credits back.',
    question: 'What happens if the customer is refunded?',
  },
  {
    answer:
      'The code has to be claimed by a new account before its first paid activity, and the first code it claims stays. Codes from your own accounts, or from accounts that share a member with you, are rejected.',
    question: 'Who counts as a referral?',
  },
  {
    answer: `No. The person you refer signs up as normal, with no referral discount. The ${AFFILIATE_REWARD_RATE_PERCENT}% reward is yours.`,
    question: 'Does the person I refer get a discount?',
  },
  {
    answer:
      'Only where billing is set up. Affiliate rewards come from credit purchases, so they work on Genfeed Cloud and on licensed self-hosted installs with organization billing. Community installs without organization billing have no affiliate program.',
    question: 'Does this work on a self-hosted install?',
  },
] as const;

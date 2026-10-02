import type {
  DoneForYouFocusLink,
  DoneForYouScopeOption,
} from '@props/website/done-for-you-scope.props';

/**
 * Smaller engagements than the full service. They used to live on /services;
 * they are booked on the same call, so they sit on the same page.
 */
export const DONE_FOR_YOU_SCOPE_OPTIONS: readonly DoneForYouScopeOption[] = [
  {
    description:
      'Get your team productive on Genfeed fast, then run it yourselves.',
    features: [
      'Platform setup and configuration',
      'Custom training workshops',
      'Brand kit setup',
      'Integration walkthroughs',
      'Ongoing email support',
    ],
    label: 'Setup and training',
  },
  {
    description:
      'Direction before execution, for teams that will produce in-house.',
    features: [
      'Content strategy audit',
      'Brand positioning workshop',
      'Channel mix optimization',
      'Content calendar design',
      'Performance framework setup',
    ],
    label: 'Content strategy',
  },
];

/** Content workflows and channels a done-for-you engagement can cover. */
export const DONE_FOR_YOU_FOCUS_LINKS: readonly DoneForYouFocusLink[] = [
  { href: '/founder-content', label: 'Founder content' },
  { href: '/podcast-to-content', label: 'Podcast to content' },
  { href: '/launch-content', label: 'Launch content' },
  { href: '/fleet', label: 'Model fleet and AI influencers' },
  { href: '/x', label: 'X growth' },
  { href: '/linkedin', label: 'LinkedIn growth' },
  { href: '/instagram', label: 'Instagram growth' },
  { href: '/tiktok', label: 'TikTok growth' },
  { href: '/youtube', label: 'YouTube growth' },
  { href: '/threads', label: 'Threads growth' },
  { href: '/facebook', label: 'Facebook growth' },
  { href: '/pinterest', label: 'Pinterest growth' },
];

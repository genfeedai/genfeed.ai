import type {
  IOnboardingButtonCard,
  IOnboardingButtonCardOption,
} from '@genfeedai/contracts/interfaces';
import { ONBOARDING_ANSWER_REWARD_CREDITS } from '@genfeedai/contracts/types';

const SKIP: IOnboardingButtonCardOption = { id: 'skip', label: 'Skip' };

/**
 * The button cards asked after the scan is confirmed, in order. Every card is
 * button-only (allowFreeText: false), has at most 5 options and ends with
 * Skip. Scan-sourced cards list at most `maxSuggestions` page-grounded
 * suggestions before Skip and fall back to `fallbackOptions`.
 */
export const ONBOARDING_BUTTON_CARDS: readonly IOnboardingButtonCard[] = [
  {
    field: 'goals',
    title: 'Goal',
    isMultiSelect: true,
    maxSelections: 3,
    options: [
      { id: 'grow_audience', label: 'Grow audience' },
      { id: 'drive_sales', label: 'Drive sales' },
      { id: 'build_authority', label: 'Build authority' },
      { id: 'stay_consistent', label: 'Stay consistent' },
      SKIP,
    ],
    save: 'goals: the chosen labels',
  },
  {
    field: 'audience',
    title: 'Audience',
    isMultiSelect: true,
    maxSelections: 2,
    suggestionSource: 'audiences',
    maxSuggestions: 4,
    options: [SKIP],
    fallbackOptions: [
      { id: 'consumers', label: 'Consumers' },
      { id: 'small_businesses', label: 'Small businesses' },
      { id: 'professionals', label: 'Professionals' },
      { id: 'creators', label: 'Creators' },
      SKIP,
    ],
    save: 'audience: the chosen labels',
    skipWarning:
      'Without an audience, posts talk to everyone and land with no one.',
  },
  {
    field: 'offer',
    title: 'Offer',
    isMultiSelect: false,
    suggestionSource: 'offers',
    maxSuggestions: 4,
    options: [SKIP],
    fallbackOptions: [
      { id: 'products', label: 'Products' },
      { id: 'services', label: 'Services' },
      { id: 'memberships', label: 'Memberships' },
      { id: 'free_trial', label: 'Free trial or demo' },
      SKIP,
    ],
    save: 'offer: the chosen label',
    skipWarning: 'Without an offer, calls to action stay vague.',
  },
  {
    field: 'competitors',
    title: 'Competitors',
    isMultiSelect: true,
    maxSelections: 3,
    suggestionSource: 'competitors',
    maxSuggestions: 3,
    options: [SKIP],
    save: 'competitors: the chosen labels',
    skipWarning:
      "Without competitors, I can't position you against them or track their ads and trends.",
  },
  {
    field: 'platforms',
    title: 'Platforms',
    isMultiSelect: true,
    maxSelections: 4,
    options: [
      { id: 'x', label: 'X' },
      { id: 'linkedin', label: 'LinkedIn' },
      { id: 'instagram', label: 'Instagram' },
      { id: 'short_video', label: 'TikTok / YouTube' },
      SKIP,
    ],
    save: 'platforms: short_video saves both tiktok and youtube; the other ids map directly to their platform values',
  },
  {
    field: 'tone',
    title: 'Tone',
    isMultiSelect: false,
    options: [
      { id: 'keep', label: 'Keep it as found' },
      { id: 'casual', label: 'More casual' },
      { id: 'professional', label: 'More professional' },
      { id: 'learn_from_instagram', label: 'Learn from my Instagram' },
      SKIP,
    ],
    save: 'toneAdjustment: the chosen id (keep preserves the scanned voice); learn_from_instagram follows the Instagram voice branch below',
  },
  {
    field: 'cadence',
    title: 'Cadence',
    isMultiSelect: false,
    options: [
      { id: 'daily', label: 'Daily' },
      { id: 'few_times_week', label: 'A few times a week' },
      { id: 'weekly', label: 'Weekly' },
      SKIP,
    ],
    save: 'cadence: the chosen id',
  },
];

export const ONBOARDING_SKIP_CONFIRMATION_OPTIONS: readonly IOnboardingButtonCardOption[] =
  [
    { id: 'skip_confirmed', label: 'Skip anyway' },
    {
      id: 'answer_it',
      label: `Answer it (+${ONBOARDING_ANSWER_REWARD_CREDITS} credits)`,
    },
  ];

function renderOptions(
  options: readonly IOnboardingButtonCardOption[],
): string {
  return options
    .map((option) => `${option.label} (id: ${option.id})`)
    .join(', ');
}

function renderCard(card: IOnboardingButtonCard, index: number): string {
  const selection = card.isMultiSelect
    ? card.suggestionSource
      ? `isMultiSelect: true, maxSelections: the smaller of ${card.maxSelections} and the number of suggestions shown (not counting Skip)`
      : `isMultiSelect: true, maxSelections: ${card.maxSelections}`
    : 'single select';
  const options = card.suggestionSource
    ? `Up to ${card.maxSuggestions} options from data.summary.suggestions.${card.suggestionSource} (label = the suggestion text, ids suggested_1, suggested_2, ...), then Skip (id: skip). ${
        card.fallbackOptions
          ? `If that list is empty, use instead: ${renderOptions(card.fallbackOptions)}.`
          : 'If that list is empty, do not show this card: say in one line that your site names no competitors so you will skip it and they can follow competitors later in Ads Intelligence, call save_onboarding_answers with skippedFields: ["competitors"], and move on.'
      }`
    : `${renderOptions(card.options)}.`;
  return `${index + 1}. ${card.title} (field: ${card.field}): ${selection}. ${options} Save as ${card.save}.`;
}

const SKIP_WARNING_CARDS = ONBOARDING_BUTTON_CARDS.filter(
  (card) => card.skipWarning,
);

export const ONBOARDING_CONVERSATION_FLOW = `## Brand setup conversation (follow this order)
- The server already wrote the greeting and asked for one public URL. Do not greet again or ask another question first.
- The user types only URLs. Use request_input for every other question with allowFreeText: false. Never ask a question in prose when a card fits. Short replies, no emoji, raw JSON, internal details, or checklist.
- On receiving a URL (typed or from Use <domain>), call scan_brand_url once before doing anything else. Accept websites, social profiles, link pages, or any public page.
- On data.status: scanned, show the tool's found-identity confirmation card, then request_input with allowFreeText: false: Looks right (id: looks_right), Try another link (id: try_another_link), Skip (id: skip). Looks right and Skip advance to goals; Skip does not undo the scanned brand.
- Try another link always requests a new URL via request_input with allowFreeText: true. Never automatically retry the same URL.
- On data.status: failed, explain the failure in one sentence without internals, then request_input with allowFreeText: false: Try another link (id: try_another_link), Continue without a website (id: continue_without_website). Handle scrape_failed, scan_failed, timeout, invalid_url, brand_not_found, forbidden, and scan_in_progress. For scan_in_progress, wait for the existing scan; never start a second scan. For Continue without a website, keep the current brand name and advance; it can be renamed later in settings. Without a scan there are no suggestions, so scan-sourced cards use their fallback.
- The existing brand is the fallback. Never ask for a name or description, never require a form or guide approval.

## Button questions
Ask one request_input at a time, in this order. Set allowFreeText: false on every card. Use at most 5 options per card, including Skip as its LAST option (id: skip). In multi-select cards Skip is exclusive of other selections. Options taken from the scan are suggestions: say they are suggested from the site, never present them as facts, and never invent options the scan did not return.
${ONBOARDING_BUTTON_CARDS.map(renderCard).join('\n')}
- Right after each answered card, call save_onboarding_answers with only that field. Each answered card earns +${ONBOARDING_ANSWER_REWARD_CREDITS} credits once; a skip never does. Never save skip as a value and never treat Skip as complete_onboarding.
- Skip on ${ONBOARDING_BUTTON_CARDS.filter((card) => !card.skipWarning)
  .map((card) => card.title)
  .join(
    ', ',
  )}: call save_onboarding_answers with skippedFields: [that field] and advance.

## Skip warnings
Only ${SKIP_WARNING_CARDS.map((card) => card.title).join(', ')} warn before skipping. When the user picks Skip on one of them, reply with exactly one line, then request_input with allowFreeText: false: ${renderOptions(ONBOARDING_SKIP_CONFIRMATION_OPTIONS)}.
${SKIP_WARNING_CARDS.map((card) => `- ${card.title}: "${card.skipWarning}"`).join('\n')}
- skip_confirmed: call save_onboarding_answers with skippedFields: [that field] and advance to the next card.
- answer_it: ask the same card again with the same options. Warn at most once per card.

## Instagram voice branch
- On Learn from my Instagram, call connect_social_account with platform: instagram and show its card. Say in one line that connecting only reads recent posts to learn the voice and never publishes.
- Then request_input with allowFreeText: false: I've connected it (id: instagram_connected), Choose a tone instead (id: choose_tone).
- instagram_connected: call get_connection_status with platform: instagram. When connected, call save_onboarding_answers with toneAdjustment: learn_from_instagram, then call draft_brand_voice_profile once and show its draft card; its posts import in the background, so if the corpus is not sufficient yet say in one line that the site voice stays until the posts are in. When not connected, say so in one sentence and ask the Tone card again.
- choose_tone: ask the Tone card again.

## Handoff (only after brand setup)
- No workspace handoff before a scanned identity is confirmed/skipped or the user chooses the fallback after a scan failure.
- Then request_input with allowFreeText: false: Create my first post (id: create_first_post), Go to my workspace (id: workspace).
- Go to my workspace calls complete_onboarding. Every earlier Skip only advances to the next question.
- Create my first post starts the existing draft flow: call generate_onboarding_content once for one brand-specific image and one tweet. Do not call generate separately. Show the actual returned preview card; never claim a missing or failed output is ready.
- Review with button-only request_input: Looks good, More casual, More professional, Try another version, Skip (id: skip). Refinement choices go in generate_onboarding_content.direction. Skip here may complete onboarding because setup and handoff are already finished.
- After explicit draft approval (including Looks good), offer optional X connection with connect_social_account. Connecting never authorizes publication; ask for separate confirmation before publishing.
- Never ask for social connections, payment, or publishing before the handoff, except the Instagram connection the user picks on the Tone card. Never require a connection or payment to leave.
- If generation fails, explain in one sentence and offer button retry or workspace. Never retry automatically. If only the tweet succeeded, keep it visible and retry generate_onboarding_content with retryTweet set to that exact tweet to regenerate only the image.
- Ground content in real products, audience and voice; never invent claims, testimonials, prices, or results.`;

/**
 * The Genfeed app surfaces, one marketing page each at /products/<slug>.
 *
 * The list mirrors the app's rail and the Apps page: every organization
 * module in `packages/contracts/src/constants/organization-modules.constant.ts`
 * plus the two core surfaces that are not modules (Agent and Library). Names,
 * one-line descriptions, highlights and access rules come from the app itself
 * (`apps/web/messages/en/common.json`, `apps/web/messages/en/pages/*`), so a
 * product page never promises something the app does not do. Add a surface to
 * the app, add it here.
 */

export type AppProductGroup = 'Create' | 'Publish & grow' | 'Operate';

export type AppProductAccess =
  /** On for every workspace. */
  | 'included'
  /** Off until the organization adds it from Apps. */
  | 'optional'
  /** Added from Apps and needs a paid plan to start new work. */
  | 'optional-paid'
  /** On by default, needs a paid plan to start new work. */
  | 'included-paid';

export interface AppProductStep {
  title: string;
  description: string;
}

export interface AppProductFaq {
  question: string;
  answer: string;
}

export interface AppProduct {
  slug: string;
  name: string;
  group: AppProductGroup;
  /** Short line used on cards, in navigation and in the hero. */
  tagline: string;
  /** SERP title, brand suffix excluded. */
  seoTitle: string;
  /** Meta description and structured-data description. */
  description: string;
  /** Plain-language definition: the sentence an AI answer would quote. */
  definition: string;
  access: AppProductAccess;
  /** Real app screenshot, under /public/products. */
  screenshot: {
    alt: string;
    src: string;
  };
  highlights: string[];
  steps: AppProductStep[];
  useCases: AppProductStep[];
  outputs: AppProductStep[];
  faqs: AppProductFaq[];
  /** Slugs of other app products worth visiting next. */
  related: string[];
  /** Optional deeper page that is not a product surface (e.g. /models). */
  learnMore?: { href: string; label: string };
}

export const APP_PRODUCT_ACCESS_LABELS: Record<AppProductAccess, string> = {
  included: 'Included in every workspace',
  'included-paid': 'On by default, paid plan to start new work',
  optional: 'Add from Apps',
  'optional-paid': 'Add from Apps, paid plan to start new work',
};

export const APP_PRODUCT_GROUPS: readonly AppProductGroup[] = [
  'Create',
  'Publish & grow',
  'Operate',
] as const;

const screenshot = (slug: string, alt: string) => ({
  alt,
  src: `/products/${slug}.webp`,
});

export const appProducts: AppProduct[] = [
  {
    access: 'included',
    definition:
      'Playground is the Genfeed app for one-off generation. You write a prompt, pick an output type and a model, and refine the result until it fits. Images, video, audio and text all start from the same prompt bar, and everything you make is saved to your Library.',
    description:
      'Playground generates images, video, audio and text from a single prompt bar, enriched with your brand. Refine with follow-up prompts; every asset is saved to your Library.',
    faqs: [
      {
        answer:
          'Images, video, audio and text. Voice and music are part of audio; written content comes from the same prompt bar. Available models depend on the format, deployment and configured providers.',
        question: 'What can I generate in Playground?',
      },
      {
        answer:
          'You can choose a model for the output you want, or use automatic routing where it is supported. The live catalog lists every model and what it is for.',
        question: 'Do I have to pick a model?',
      },
      {
        answer:
          'Every generated asset is saved to your Library, so nothing is lost when you close the tab. From there you can reuse it in Storyboard, Editor or Publishing.',
        question: 'Where do my generations go?',
      },
      {
        answer:
          'Generation uses credits. Playground is included in every workspace; the amount depends on the model and the output.',
        question: 'Is Playground free?',
      },
    ],
    group: 'Create',
    highlights: [
      'Generate images, videos, audio and text',
      'Iterate on a result with follow-up prompts',
      'Every asset is saved to your Library',
    ],
    learnMore: { href: '/models', label: 'See the live model catalog' },
    name: 'Playground',
    outputs: [
      {
        description:
          'Campaign stills, product shots and design variations in the ratio you need.',
        title: 'Images',
      },
      {
        description:
          'Short-form clips and campaign footage from a brief or a reference.',
        title: 'Video',
      },
      {
        description: 'Voiceovers, spoken tracks and music.',
        title: 'Audio',
      },
      {
        description:
          'Captions, scripts and copy written from the same prompt bar.',
        title: 'Text',
      },
    ],
    related: ['storyboard', 'editor', 'library'],
    screenshot: screenshot(
      'playground',
      'The Genfeed Playground with the prompt bar open and generated images in the canvas',
    ),
    seoTitle: 'Playground: AI Image, Video and Audio Generation',
    slug: 'playground',
    steps: [
      {
        description: 'Write a prompt, or attach a reference image or video.',
        title: 'Describe',
      },
      {
        description:
          'Choose the output type and model, or let routing choose where supported.',
        title: 'Generate',
      },
      {
        description: 'Follow up with a new prompt until the result fits.',
        title: 'Refine',
      },
      {
        description:
          'The result is saved to your Library, ready to edit or publish.',
        title: 'Keep',
      },
    ],
    tagline: 'Generate images, video, audio and text from a prompt',
    useCases: [
      {
        description:
          'A product photo on a clean studio background, in every ratio your channels need.',
        title: 'Product imagery',
      },
      {
        description:
          'A short ad that opens on the product, says one benefit and ends on the brand.',
        title: 'Short product ads',
      },
      {
        description:
          'Change an existing image with a prompt, with masks where the model supports them.',
        title: 'Editing a source image',
      },
    ],
  },
  {
    access: 'included',
    definition:
      'Storyboard is the Genfeed app for planning a video before you spend credits on it. It breaks a brief into scenes and shots, lets you edit the plan, then generates the frames and clips for each scene.',
    description:
      'Storyboard turns a brief into a shot list you can edit, then generates a still and a clip for every scene. Built for ads, explainers and short stories.',
    faqs: [
      {
        answer:
          'Your plan comes first. Storyboard drafts a shot list from a brief, and you can edit, add or delete shots before anything is generated.',
        question: 'Do I pay before I see the plan?',
      },
      {
        answer:
          'Yes. Each shot has a duration and a still preview, so the whole storyboard can be reviewed before the clips are produced.',
        question: 'Can I review shots before the video is made?',
      },
      {
        answer:
          'Yes. Choose a post or ad in Discovery and choose Remix; the run is saved in Storyboard as a storyboard you can change.',
        question: 'Can I start from something that already works?',
      },
      {
        answer:
          'Storyboard is included in every workspace. Generation spends credits.',
        question: 'Is Storyboard included in my plan?',
      },
    ],
    group: 'Create',
    highlights: [
      'Turn a brief into scenes and shots',
      'Edit the plan before you spend credits',
      'Generate each scene from the plan',
    ],
    name: 'Storyboard',
    outputs: [
      {
        description: 'A scene-by-scene plan with a duration for each shot.',
        title: 'Shot list',
      },
      {
        description: 'A still preview for every shot, before any video runs.',
        title: 'Frames',
      },
      {
        description: 'A video clip generated for each scene from the plan.',
        title: 'Clips',
      },
    ],
    related: ['editor', 'playground', 'discovery'],
    screenshot: screenshot(
      'storyboard',
      'The Genfeed Storyboard showing a shot list with a still frame for each scene',
    ),
    seoTitle: 'Storyboard: Plan and Generate Video Scene by Scene',
    slug: 'storyboard',
    steps: [
      {
        description:
          'Describe the video you want, or start from a saved brief.',
        title: 'Brief',
      },
      {
        description:
          'Storyboard drafts a shot list you can rewrite and reorder.',
        title: 'Plan',
      },
      {
        description: 'Check each shot’s still and duration against the brief.',
        title: 'Review',
      },
      {
        description: 'Generate the clip for each scene from the approved plan.',
        title: 'Generate',
      },
    ],
    tagline: 'Plan a story scene by scene, then generate it',
    useCases: [
      {
        description: 'Plan an ad shot by shot before you generate it.',
        title: 'Ads',
      },
      {
        description:
          'Break a product explainer into scenes that each carry one idea.',
        title: 'Explainers',
      },
      {
        description:
          'Assign character images and saved voices to the shots of a short story.',
        title: 'Short stories',
      },
    ],
  },
  {
    access: 'optional',
    definition:
      'Clipper is the Genfeed app that turns long videos and audio into short clips. You bring in a recording or a link, pick the highlights, and export captioned clips that are ready for social.',
    description:
      'Clipper cuts the best moments of a long video or recording into short, captioned clips ready for social. Start from a YouTube link, an upload or your Library.',
    faqs: [
      {
        answer:
          'A YouTube link, an uploaded file, or a video already in your Library.',
        question: 'What can I clip?',
      },
      {
        answer:
          'Long-form audio and video up to 10 GB and 6 hours are supported.',
        question: 'How long can the source be?',
      },
      {
        answer:
          'You choose which highlights to cut. Completed clips stay ready, and a retry only reruns the work that failed.',
        question: 'Do I control which moments become clips?',
      },
      {
        answer:
          'Clipper is added from Apps in your organization settings. Its generation uses credits.',
        question: 'How do I turn Clipper on?',
      },
    ],
    group: 'Create',
    highlights: [
      'Import a long video or audio file',
      'Pick the highlights to cut',
      'Export clips ready to publish',
    ],
    learnMore: {
      href: '/tools/youtube-clipper',
      label: 'Try the free YouTube clipper tool',
    },
    name: 'Clipper',
    outputs: [
      {
        description: 'Short captioned clips cut from the source video.',
        title: 'Clips',
      },
      {
        description:
          'Every clip is saved to your Library and can go straight to Publishing.',
        title: 'Library assets',
      },
    ],
    related: ['editor', 'publishing', 'library'],
    screenshot: screenshot(
      'clipper',
      'The Genfeed Clipper showing a source video and the clips generated from it',
    ),
    seoTitle: 'Clipper: Turn Long Videos into Short Clips',
    slug: 'clipper',
    steps: [
      {
        description:
          'Add a YouTube link, upload a file or choose from Library.',
        title: 'Import',
      },
      {
        description:
          'Clipper processes the source video and creates clips to review.',
        title: 'Analyze',
      },
      {
        description: 'Select the moments worth cutting.',
        title: 'Pick',
      },
      {
        description: 'Export captioned clips and publish them.',
        title: 'Export',
      },
    ],
    tagline: 'Turn long videos and audio into short clips',
    useCases: [
      {
        description:
          'Cut an hour-long episode into a week of short clips for social.',
        title: 'Podcasts',
      },
      {
        description:
          'Pull the strongest answers out of an interview or webinar.',
        title: 'Interviews and webinars',
      },
      {
        description:
          'Repurpose a long YouTube upload into Shorts, Reels and TikToks.',
        title: 'Long-form YouTube',
      },
    ],
  },
  {
    access: 'optional',
    definition:
      'Motion is the Genfeed app for animated visuals. You describe an animated title, caption or branded graphic, preview it, and render it to video or still frames that land in your Library.',
    description:
      'Motion turns a prompt into animated titles, captions and branded graphics, previews them, and renders to video or stills. Review a credit quote before anything renders.',
    faqs: [
      {
        answer:
          'Motion projects run up to 30 seconds at 1920×1080, at 24 or 30 frames per second, with up to eight outputs per request.',
        question: 'What are the limits of a Motion render?',
      },
      {
        answer:
          'No. A preset only fills in the form. You review a credit quote and confirm it before anything is rendered.',
        question: 'Does a preset start a render?',
      },
      {
        answer:
          'Yes. Reference up to twelve recent Library assets in a project. Motion compositions are React and Remotion source you can edit directly.',
        question: 'Can I use my own assets?',
      },
      {
        answer:
          'Motion is added from Apps in your organization settings. Rendering uses credits and unused credits from the quote are released.',
        question: 'How do I turn Motion on?',
      },
    ],
    group: 'Create',
    highlights: [
      'Compose animated visuals',
      'Preview before you render',
      'Render to video',
    ],
    name: 'Motion',
    outputs: [
      {
        description: 'A rendered animated video, up to 30 seconds.',
        title: 'Video',
      },
      {
        description:
          'Still frames from the composition at the frames you choose.',
        title: 'Stills',
      },
    ],
    related: ['editor', 'playground', 'publishing'],
    screenshot: screenshot(
      'motion',
      'The Genfeed Motion app with a prompt, a presets list and a preview of an animated title',
    ),
    seoTitle: 'Motion: AI Animated Titles, Captions and Graphics',
    slug: 'motion',
    steps: [
      {
        description:
          'Write a prompt or start from a preset such as a quote, a counter or a logo reveal.',
        title: 'Describe',
      },
      {
        description: 'Preview the animation before you render it.',
        title: 'Preview',
      },
      {
        description: 'Review the credit quote and confirm.',
        title: 'Approve',
      },
      {
        description: 'Render to video or stills in your Library.',
        title: 'Render',
      },
    ],
    tagline: 'Build animated visuals and render them to video',
    useCases: [
      {
        description:
          'A punchy quote that lands word by word on a bold background.',
        title: 'Quote cards',
      },
      {
        description:
          'A headline number that counts up with a label and a progress bar.',
        title: 'Stat reveals',
      },
      {
        description: 'A name and title that slide over a video and back out.',
        title: 'Lower thirds',
      },
    ],
  },
  {
    access: 'optional',
    definition:
      'Turbo is the Genfeed app for creating content in bulk. It drafts content ideas from your brand, generates them in one batch, and lines up the ones you keep to publish.',
    description:
      'Turbo drafts content ideas from your brand, generates images and video in bulk, and lines up the keepers to publish. Review every idea and a credit quote before anything runs.',
    faqs: [
      {
        answer:
          'No. You review every idea before anything is generated, and nothing posts unless you schedule it.',
        question: 'Does Turbo post on its own?',
      },
      {
        answer:
          'You see a credit quote for the whole batch first. Only usable output is charged.',
        question: 'How am I charged for a batch?',
      },
      {
        answer:
          'Yes. You can run one of your saved workflows on every image or video you add. That path needs Automation and a paid plan; idea projects only need credits.',
        question: 'Can I run my own workflow over a batch?',
      },
      {
        answer: 'Turbo is added from Apps in your organization settings.',
        question: 'How do I turn Turbo on?',
      },
    ],
    group: 'Create',
    highlights: [
      'Run many generations from one brief',
      'Review the batch and keep what works',
      'Send the winners to your Library',
    ],
    learnMore: { href: '/turbo', label: 'Start with Turbo' },
    name: 'Turbo',
    outputs: [
      {
        description: 'A batch of on-brand images and videos in one run.',
        title: 'Generated batch',
      },
      {
        description: 'Captions drafted for each piece.',
        title: 'Captions',
      },
      {
        description:
          'The keepers scheduled to the accounts and times you choose.',
        title: 'Scheduled posts',
      },
    ],
    related: ['automation', 'publishing', 'playground'],
    screenshot: screenshot(
      'turbo',
      'The Genfeed Turbo app with a week of content ideas ready to review',
    ),
    seoTitle: 'Turbo: Bulk AI Content From One Brief',
    slug: 'turbo',
    steps: [
      {
        description:
          'Pick a preset or describe a topic. Turbo uses your brand.',
        title: 'Brief',
      },
      {
        description: 'Review the drafted ideas and remove what does not fit.',
        title: 'Review',
      },
      {
        description: 'Confirm the credit quote and generate the batch.',
        title: 'Generate',
      },
      {
        description: 'Keep the winners and schedule them.',
        title: 'Schedule',
      },
    ],
    tagline: 'Create content in bulk from one brief',
    useCases: [
      {
        description:
          'A balanced week: a product highlight, a tip, a behind-the-scenes moment and a customer story.',
        title: 'Filling a content calendar',
      },
      {
        description:
          'Apply one workflow to every image or video you add, then review and schedule the results.',
        title: 'Batch processing',
      },
      {
        description:
          'Describe a topic, generate ideas, then turn them into content.',
        title: 'Idea projects',
      },
    ],
  },
  {
    access: 'optional',
    definition:
      'Editor is the Genfeed app for assembling and finishing video on a timeline. You combine clips, images and audio, trim and arrange them, apply effects, and export the finished video.',
    description:
      'Editor assembles clips, images and audio on a timeline. Trim, layer audio, add effects and export the finished video, with your generated videos imported directly.',
    faqs: [
      {
        answer:
          'Generated videos from your Library can be imported directly, so a Storyboard or Playground result can be finished here.',
        question: 'Can I edit videos I generated in Genfeed?',
      },
      {
        answer:
          'Yes. Add audio tracks to the timeline, trim them and layer them with your clips.',
        question: 'Can I add music and voice?',
      },
      {
        answer: 'Editor is added from Apps in your organization settings.',
        question: 'How do I turn Editor on?',
      },
    ],
    group: 'Create',
    highlights: [
      'Arrange clips on a timeline',
      'Trim and layer audio',
      'Export the finished video',
    ],
    name: 'Editor',
    outputs: [
      {
        description: 'A finished video exported from the timeline.',
        title: 'Exported video',
      },
      {
        description: 'Editable projects you can reopen and change.',
        title: 'Saved projects',
      },
    ],
    related: ['storyboard', 'clipper', 'publishing'],
    screenshot: screenshot(
      'editor',
      'The Genfeed Editor with clips and audio arranged on a timeline',
    ),
    seoTitle: 'Editor: Timeline Video Editing for AI-Generated Content',
    slug: 'editor',
    steps: [
      {
        description: 'Start a project and import clips, images and audio.',
        title: 'Import',
      },
      {
        description: 'Arrange and trim everything on the timeline.',
        title: 'Arrange',
      },
      {
        description: 'Layer audio and apply effects.',
        title: 'Finish',
      },
      {
        description: 'Export the finished video.',
        title: 'Export',
      },
    ],
    tagline: 'Assemble and finish video on a timeline',
    useCases: [
      {
        description:
          'Stitch generated scenes from Storyboard into one finished video.',
        title: 'Assembling a storyboard',
      },
      {
        description: 'Add a voiceover and music bed to generated footage.',
        title: 'Adding audio',
      },
      {
        description: 'Trim and re-order Clipper output into a tighter cut.',
        title: 'Polishing clips',
      },
    ],
  },
  {
    access: 'included',
    definition:
      'Publishing is the Genfeed app for scheduling and posting content. It takes drafts from every other surface and publishes them to your connected channels from one composer and calendar.',
    description:
      'Publishing schedules and posts content to X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Pinterest, Reddit, Discord and Twitch from one place. Review drafts, schedule weeks ahead.',
    faqs: [
      {
        answer:
          'X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Pinterest, Reddit, Discord and Twitch.',
        question: 'Which platforms can I publish to?',
      },
      {
        answer:
          'Posts move through draft, scheduled and public states, and you choose the accounts and the time for each one.',
        question: 'How do I control what gets posted?',
      },
      {
        answer:
          'Yes. Schedule content in advance and review what is queued on the calendar.',
        question: 'Can I schedule weeks ahead?',
      },
    ],
    group: 'Publish & grow',
    highlights: [
      'Draft, schedule and publish in one place',
      'Ten major platforms from one composer',
      'Review what is queued before it goes out',
    ],
    learnMore: { href: '/calendar', label: 'See the content calendar' },
    name: 'Publishing',
    outputs: [
      {
        description: 'Posts live on your connected channels.',
        title: 'Published posts',
      },
      {
        description: 'A queue of scheduled posts you can review and change.',
        title: 'Scheduled queue',
      },
    ],
    related: ['analytics', 'turbo', 'messages'],
    screenshot: screenshot(
      'publishing',
      'The Genfeed Publishing desk showing draft, scheduled and published posts',
    ),
    seoTitle: 'Publishing: Schedule and Post to 10+ Platforms',
    slug: 'publishing',
    steps: [
      {
        description: 'Connect the accounts you publish to.',
        title: 'Connect',
      },
      {
        description: 'Review the drafts your other apps produced.',
        title: 'Review',
      },
      {
        description: 'Pick the accounts and a time, or publish now.',
        title: 'Schedule',
      },
      {
        description: 'Watch the post go out, then read its results.',
        title: 'Publish',
      },
    ],
    tagline: 'Review, schedule and publish everywhere',
    useCases: [
      {
        description:
          'Post daily across every platform without the manual work.',
        title: 'Creators',
      },
      {
        description:
          'Manage several brands, each with its own accounts and schedule.',
        title: 'Agencies',
      },
      {
        description:
          'Launch an announcement on every channel at the same time.',
        title: 'Campaigns',
      },
    ],
  },
  {
    access: 'included',
    definition:
      'Analytics is the Genfeed app for measuring published content. It shows available views and engagement for each post and brand, so you can plan the next brief from what worked.',
    description:
      'Analytics reviews available views and engagement across your published content. Compare posts and brands, find the formats that earn attention, and plan the next brief.',
    faqs: [
      {
        answer:
          'The views and engagement each platform makes available for your published posts, rolled up per post and per brand.',
        question: 'What does Analytics measure?',
      },
      {
        answer:
          'Figures depend on what each connected platform reports, so some metrics are not available for every channel.',
        question: 'Why is a metric missing for a post?',
      },
      {
        answer:
          'Yes. Analytics rolls performance up per brand so you can compare a whole portfolio.',
        question: 'Can I compare brands?',
      },
    ],
    group: 'Publish & grow',
    highlights: [
      'Compare performance across posts',
      'Review hooks and trends',
      'Roll up results per brand',
    ],
    name: 'Analytics',
    outputs: [
      {
        description: 'Views and engagement per published post.',
        title: 'Post performance',
      },
      {
        description: 'Roll-ups per brand and per channel.',
        title: 'Brand roll-ups',
      },
      {
        description: 'Which hooks and formats earn attention.',
        title: 'Hook and format insight',
      },
    ],
    related: ['publishing', 'discovery', 'agent'],
    screenshot: screenshot(
      'analytics',
      'The Genfeed Analytics dashboard with post performance and a brand roll-up',
    ),
    seoTitle: 'Analytics: Content Performance Across Every Brand',
    slug: 'analytics',
    steps: [
      {
        description: 'Publish to your connected channels.',
        title: 'Publish',
      },
      {
        description: 'Review available views and engagement per post.',
        title: 'Measure',
      },
      {
        description: 'Find the formats that earn views and engagement.',
        title: 'Learn',
      },
      {
        description: 'Repeat what works and cut what does not.',
        title: 'Double down',
      },
    ],
    tagline: 'See what works, then make more of it',
    useCases: [
      {
        description:
          'Compare available views and engagement across your published posts.',
        title: 'Post performance',
      },
      {
        description:
          'Compare published variations and use them to guide your next brief.',
        title: 'Testing variations',
      },
      {
        description: 'Track consistency across every brand and channel.',
        title: 'Staying consistent',
      },
    ],
  },
  {
    access: 'included-paid',
    definition:
      'Discovery is the Genfeed app for finding what to make next. It researches what is trending on social platforms in your brand’s niche, ranks it, and turns a trend into a content idea.',
    description:
      'Discovery researches trending topics on social platforms for your brand’s niche, ranks them by niche match and turns a trend into a post idea or a saved brief.',
    faqs: [
      {
        answer:
          'Topics are searched for your brand’s niche and ranked by how well they match it. Availability of a signal depends on what each platform exposes.',
        question: 'Where do the trends come from?',
      },
      {
        answer:
          'Yes. Save a brief from Discovery to start a content run, or choose Remix on a post or ad to open it as a storyboard.',
        question: 'Can I turn a trend into content?',
      },
      {
        answer:
          'Discovery is on by default and needs a paid plan to start new work. Existing data stays readable.',
        question: 'Is Discovery on my plan?',
      },
    ],
    group: 'Publish & grow',
    highlights: [
      'Trending topics ranked by niche match',
      'Spot what is working on each platform',
      'Turn a trend into a post idea',
    ],
    name: 'Discovery',
    outputs: [
      {
        description: 'A ranked list of topics for your niche.',
        title: 'Trend list',
      },
      {
        description:
          'A brief that starts a content run with its variants, publish events and analytics.',
        title: 'Saved briefs',
      },
      {
        description: 'A remix of a post or ad, opened as a storyboard.',
        title: 'Remix storyboards',
      },
    ],
    related: ['storyboard', 'playground', 'analytics'],
    screenshot: screenshot(
      'discovery',
      'The Genfeed Discovery app listing trending topics ranked by niche match',
    ),
    seoTitle: 'Discovery: Find Trends and Content Opportunities',
    slug: 'discovery',
    steps: [
      {
        description: 'Discovery reads your brand’s niche.',
        title: 'Search',
      },
      {
        description: 'Trends are ranked by how well they match.',
        title: 'Rank',
      },
      {
        description: 'Save a brief or remix a post.',
        title: 'Choose',
      },
      {
        description: 'Create the content in Playground or Storyboard.',
        title: 'Create',
      },
    ],
    tagline: 'Find trends and content opportunities in your niche',
    useCases: [
      {
        description: 'Find a topic worth a post this week.',
        title: 'Weekly ideas',
      },
      {
        description:
          'Follow the advertisers and sources you want to learn from.',
        title: 'Reference research',
      },
      {
        description: 'Remix a winning post into your own brand’s version.',
        title: 'Remixing winners',
      },
    ],
  },
  {
    access: 'optional-paid',
    definition:
      'Messages is the Genfeed app for your audience inbox. It brings comments and messages from connected channels into one place so you can read and reply without leaving Genfeed.',
    description:
      'Messages brings comments and messages from your connected channels into one inbox. Read and reply in place and keep up with your audience.',
    faqs: [
      {
        answer:
          'Comments and messages from the channels you have connected, shown together.',
        question: 'What shows up in Messages?',
      },
      {
        answer:
          'Yes. Reply from Genfeed; an unread badge on the app shows what needs attention.',
        question: 'Can I reply from Genfeed?',
      },
      {
        answer:
          'Messages is added from Apps and needs a paid plan to start new work.',
        question: 'How do I turn Messages on?',
      },
    ],
    group: 'Publish & grow',
    highlights: [
      'One inbox across your channels',
      'Reply in place',
      'Keep up with your audience',
    ],
    name: 'Messages',
    outputs: [
      {
        description: 'Replies sent to your audience from one place.',
        title: 'Replies',
      },
      {
        description: 'A single, brand-scoped inbox with an unread count.',
        title: 'Unified inbox',
      },
    ],
    related: ['publishing', 'analytics', 'agent'],
    screenshot: screenshot(
      'messages',
      'The Genfeed Messages inbox with comments and messages from connected channels',
    ),
    seoTitle: 'Messages: One Inbox for Every Channel',
    slug: 'messages',
    steps: [
      {
        description: 'Connect your channels.',
        title: 'Connect',
      },
      {
        description: 'Comments and messages arrive in one inbox.',
        title: 'Read',
      },
      {
        description: 'Reply without leaving Genfeed.',
        title: 'Reply',
      },
    ],
    tagline: 'Read and reply to your audience in one inbox',
    useCases: [
      {
        description: 'Answer comments on a launch post the same day.',
        title: 'Launch replies',
      },
      {
        description: 'Handle several brands’ inboxes without switching apps.',
        title: 'Multi-brand inboxes',
      },
    ],
  },
  {
    access: 'included',
    definition:
      'Agent is the Genfeed chat that does the work. You ask in plain language and the agent generates images and video, drafts and edits posts, schedules and publishes, and reads performance data, all with your brand context.',
    description:
      'The Genfeed Agent generates images and video, drafts and edits posts, schedules and publishes, and reads performance data from a chat thread that knows your brand.',
    faqs: [
      {
        answer:
          'It can generate images and video, draft and edit posts, schedule and publish, and read performance data, using your brand context.',
        question: 'What can the Agent do?',
      },
      {
        answer:
          'Yes. Install the Genfeed CLI, or connect Claude, ChatGPT, Codex, Cursor and other MCP clients to the hosted MCP server. See the developer page for setup.',
        question: 'Can I use the same agent outside the app?',
      },
      {
        answer:
          'Agent conversations are saved as threads you can reopen. The agent dock lets you chat from any page.',
        question: 'Are my conversations kept?',
      },
    ],
    group: 'Operate',
    highlights: [
      'Generate, draft, schedule and publish by asking',
      'Conversations are saved as threads',
      'Chat from any page with the agent dock',
    ],
    learnMore: { href: '/agent', label: 'Use the agent from the CLI and MCP' },
    name: 'Agent',
    outputs: [
      {
        description: 'Generated images and video added to your Library.',
        title: 'Media',
      },
      {
        description: 'Drafted and edited posts, scheduled when you ask.',
        title: 'Posts',
      },
      {
        description: 'Answers drawn from your performance data.',
        title: 'Insights',
      },
    ],
    related: ['automation', 'playground', 'publishing'],
    screenshot: screenshot(
      'agent',
      'The Genfeed Agent chat with a prompt in the input and a saved thread list',
    ),
    seoTitle: 'Agent: Create and Publish by Chatting With Genfeed',
    slug: 'agent',
    steps: [
      {
        description: 'Ask for what you want in plain language.',
        title: 'Ask',
      },
      {
        description: 'The agent works with your brand context and tools.',
        title: 'Work',
      },
      {
        description: 'Review what it made or scheduled.',
        title: 'Review',
      },
      {
        description: 'Continue the thread whenever you need more.',
        title: 'Continue',
      },
    ],
    tagline: 'Ask for the work. The agent does it',
    useCases: [
      {
        description:
          'Draft a still for the weekly drop and caption it for each channel.',
        title: 'Weekly content',
      },
      {
        description: 'Ask what performed best this month and why.',
        title: 'Performance questions',
      },
      {
        description: 'Delegate a recurring publishing routine.',
        title: 'Routine work',
      },
    ],
  },
  {
    access: 'optional-paid',
    definition:
      'Automation is the Genfeed app for workflows and recurring tasks. You build or install workflows that generate, schedule and publish content on their own, so recurring work happens without you starting it.',
    description:
      'Automation runs workflows that generate, schedule and publish content on a schedule. Browse and install ready-made workflows or build your own node by node.',
    faqs: [
      {
        answer:
          'Yes. A workflow is made of explicit steps, so you can see every trigger, handoff and output and why a run happened.',
        question: 'Can I see what a workflow did?',
      },
      {
        answer:
          'Start from ready-made workflows from the library, or build your own on the canvas with input, AI, processing and distribution steps.',
        question: 'Do I have to build workflows myself?',
      },
      {
        answer:
          'Automation is added from Apps and needs a paid plan to run workflows.',
        question: 'How do I turn Automation on?',
      },
    ],
    group: 'Operate',
    highlights: [
      'Browse and install ready-made workflows',
      'Run on a schedule',
      'Combine generation and publishing steps',
    ],
    learnMore: { href: '/hire-agents', label: 'Hire agents to run it for you' },
    name: 'Automation',
    outputs: [
      {
        description: 'Content generated on a schedule or on an event.',
        title: 'Recurring content',
      },
      {
        description: 'Posts scheduled or published by a workflow.',
        title: 'Published posts',
      },
      {
        description: 'A run history you can inspect step by step.',
        title: 'Run history',
      },
    ],
    related: ['agent', 'turbo', 'publishing'],
    screenshot: screenshot(
      'automation',
      'The Genfeed Automation workflow canvas with connected generation and publishing steps',
    ),
    seoTitle: 'Automation: Workflows That Generate and Publish',
    slug: 'automation',
    steps: [
      {
        description: 'Install a workflow or build one on the canvas.',
        title: 'Author',
      },
      {
        description: 'Connect inputs, AI steps, processing and distribution.',
        title: 'Wire',
      },
      {
        description: 'Choose a manual start, a schedule or an event trigger.',
        title: 'Trigger',
      },
      {
        description: 'Inspect every run and its outputs.',
        title: 'Operate',
      },
    ],
    tagline: 'Run workflows and recurring tasks',
    useCases: [
      {
        description: 'Generate and schedule a daily post from a brief.',
        title: 'Daily posting',
      },
      {
        description: 'Gate a post behind a review step before it publishes.',
        title: 'Approval flows',
      },
      {
        description: 'Let an agent trigger a workflow you control.',
        title: 'Agent-triggered runs',
      },
    ],
  },
  {
    access: 'included',
    definition:
      'Library is the Genfeed home for every asset. Everything you generate, import or approve is saved and searchable, and brand kits and moodboards keep your logos, colors, fonts and references reusable.',
    description:
      'Library saves every generated and imported asset, searchable and reusable across Genfeed. Keep brand kits and moodboards so every generation stays on brand.',
    faqs: [
      {
        answer:
          'Every image, video and voice you generate is auto-saved and searchable, along with your brand kits and moodboards.',
        question: 'What is stored in the Library?',
      },
      {
        answer:
          'Yes. Assets are shared across your team so everyone works from one source.',
        question: 'Is the Library shared with my team?',
      },
      {
        answer:
          'Pull a saved asset into any later generation as a reference, or collect references into a moodboard.',
        question: 'Can I reuse saved assets?',
      },
    ],
    group: 'Operate',
    highlights: [
      'Every output is auto-saved and searchable',
      'Brand kits for logos, colors, fonts and voice',
      'Moodboards to steer new generations',
    ],
    name: 'Library',
    outputs: [
      {
        description: 'A searchable archive of every image, video and voice.',
        title: 'Asset archive',
      },
      {
        description: 'Reusable brand kits and moodboards.',
        title: 'Brand references',
      },
    ],
    related: ['playground', 'editor', 'publishing'],
    screenshot: screenshot(
      'library',
      'The Genfeed Library showing a grid of saved images and videos',
    ),
    seoTitle: 'Library: Every Asset Saved, Searchable, Reusable',
    slug: 'library',
    steps: [
      {
        description: 'Generate or import assets.',
        title: 'Create',
      },
      {
        description: 'Every output lands in your Library automatically.',
        title: 'Save',
      },
      {
        description: 'Group assets into brand kits and moodboards.',
        title: 'Organize',
      },
      {
        description: 'Pull saved assets into any future generation.',
        title: 'Reuse',
      },
    ],
    tagline: 'Every asset, saved once and reusable',
    useCases: [
      {
        description:
          'Keep logos, colors, fonts and voice references in one kit.',
        title: 'Brand kits',
      },
      {
        description:
          'Collect references into a moodboard to keep a consistent look.',
        title: 'Moodboards',
      },
      {
        description:
          'Share assets across the team so everyone uses the approved version.',
        title: 'Team sharing',
      },
    ],
  },
];

export function getAllAppProductSlugs(): string[] {
  return appProducts.map((product) => product.slug);
}

export function getAppProductBySlug(slug: string): AppProduct | undefined {
  return appProducts.find((product) => product.slug === slug);
}

export function getRelatedAppProducts(slug: string): AppProduct[] {
  const product = getAppProductBySlug(slug);
  if (!product) {
    return [];
  }
  return product.related
    .map((relatedSlug) => getAppProductBySlug(relatedSlug))
    .filter((related): related is AppProduct => related !== undefined);
}

export function getAppProductsByGroup(group: AppProductGroup): AppProduct[] {
  return appProducts.filter((product) => product.group === group);
}

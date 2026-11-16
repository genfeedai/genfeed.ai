export interface Integration {
  slug: string;
  name: string;
  icon: string;
  /** What Genfeed does on this platform, in a few words. No full stop. */
  tagline: string;
  description: string;
  /** Content types the platform accepts from Genfeed. */
  formats: string;
  /** Present only where Genfeed reads results back from the platform. */
  results?: string;
  features: string[];
  workflow: { step: number; title: string; description: string }[];
}

/**
 * One plain button label for every integration page. It opens the same sign-up
 * the other site buttons use.
 */
export const INTEGRATION_CTA = 'Connect Agent';

/**
 * Every claim on these pages is read from the product, not from the platform's
 * marketing. Where each fact lives:
 *
 * - Formats: `supports*` flags on each class in
 *   `apps/server/api/src/services/integrations/publishers`.
 * - Results: platforms handled by `collectionWorkflowForPlatform` in
 *   `collections/workflows/services/analytics-sync-workflow.service.ts`
 *   (Facebook, Threads, X, YouTube, Instagram, LinkedIn, Mastodon, Pinterest,
 *   TikTok).
 * - Chat commands: the command maps in `services/bot-gateway/adapters`.
 * - Twitch live chat messages: `BotLivestreamMessageType` in
 *   `collections/bots/schemas/bot.schema.ts`.
 *
 * Add a claim only after finding it in one of those places. Do not promise
 * reach, views, growth or algorithm results, and do not name models.
 */
export const integrations: Integration[] = [
  {
    description:
      'A brief becomes a YouTube video with its title, description and thumbnail ready. Genfeed uploads it to your channel.',
    features: [
      'Uploads video to your channel with the title, description and tags from the draft',
      'Sets a thumbnail taken from the video, in your brand cover style',
      'Posts follow-up text under the video as comments',
      'Likes, comments and views for each video appear in your Genfeed analytics',
    ],
    formats: 'Video',
    icon: 'YoutubeIcon',
    name: 'YouTube',
    results: 'Likes, comments and views',
    slug: 'youtube',
    tagline: 'Videos with titles and thumbnails, uploaded to your channel',
    workflow: [
      {
        description: 'Tell your agent what the video is about.',
        step: 1,
        title: 'Brief',
      },
      {
        description:
          'Genfeed makes the video and drafts the title and description. You review the draft in your dashboard.',
        step: 2,
        title: 'Draft',
      },
      {
        description:
          'Genfeed uploads the approved video to your channel and sets the thumbnail.',
        step: 3,
        title: 'Upload',
      },
      {
        description: 'Likes, comments and views come back to your analytics.',
        step: 4,
        title: 'Read results',
      },
    ],
  },
  {
    description:
      'Briefs become TikTok videos and photo posts. Genfeed posts them to your account, or sends a video to your TikTok inbox to finish in the app.',
    features: [
      'Posts videos and photo carousels to your account',
      'Sends a video to your TikTok inbox when you want to finish it in the app',
      'Trending TikTok topics, hashtags and sounds are available to brief from',
      'Likes, comments and views for each post appear in your Genfeed analytics',
    ],
    formats: 'Video, photo carousel',
    icon: 'TiktokIcon',
    name: 'TikTok',
    results: 'Likes, comments and views',
    slug: 'tiktok',
    tagline: 'Short videos and photo posts, posted or sent to your inbox',
    workflow: [
      {
        description:
          'Tell your agent the topic, or start from a trending hashtag or sound.',
        step: 1,
        title: 'Brief',
      },
      {
        description:
          'Genfeed makes the video or photo set and drafts the caption.',
        step: 2,
        title: 'Draft',
      },
      {
        description:
          'Genfeed posts to your account, or sends the video to your TikTok inbox.',
        step: 3,
        title: 'Post',
      },
      {
        description: 'Likes, comments and views come back to your analytics.',
        step: 4,
        title: 'Read results',
      },
    ],
  },
  {
    description:
      'Reels, single images and carousels made from one brief, with the caption written. Genfeed posts them to your Instagram account.',
    features: [
      'Posts single images, carousels of 2 to 10 images, and Reels',
      'Writes the caption with the visuals, in your brand voice',
      'Follow-up text posts as comments under the post',
      'Likes, comments and views for each post appear in your Genfeed analytics',
    ],
    formats: 'Image, carousel, Reel',
    icon: 'InstagramIcon',
    name: 'Instagram',
    results: 'Likes, comments and views',
    slug: 'instagram',
    tagline: 'Reels, images and carousels with the caption written',
    workflow: [
      {
        description:
          'Tell your agent what the post is about and which format you want.',
        step: 1,
        title: 'Brief',
      },
      {
        description:
          'Genfeed makes the Reel, image or carousel and writes the caption.',
        step: 2,
        title: 'Draft',
      },
      {
        description: 'Genfeed posts the approved draft to your account.',
        step: 3,
        title: 'Post',
      },
      {
        description: 'Likes, comments and views come back to your analytics.',
        step: 4,
        title: 'Read results',
      },
    ],
  },
  {
    description:
      'Text posts, images and video written for LinkedIn from one brief. Genfeed posts them to your profile.',
    features: [
      'Posts text, image and video posts',
      'Writes the post from a brief, an article or a product update',
      'Adds follow-up text as the first comment',
      'Results for each post appear in your Genfeed analytics',
    ],
    formats: 'Text, image, video',
    icon: 'LinkedinIcon',
    name: 'LinkedIn',
    results: 'Post results',
    slug: 'linkedin',
    tagline: 'Posts written from your brief, with images and video',
    workflow: [
      {
        description: 'Give your agent a topic, an article or a product update.',
        step: 1,
        title: 'Brief',
      },
      {
        description:
          'Genfeed writes the post in your brand voice and makes an image or video if you want one.',
        step: 2,
        title: 'Draft',
      },
      {
        description: 'Genfeed posts the approved draft to your profile.',
        step: 3,
        title: 'Post',
      },
      {
        description: 'Results come back to your analytics.',
        step: 4,
        title: 'Read results',
      },
    ],
  },
  {
    description:
      'Posts with images or video, written once and published to your Facebook Page.',
    features: [
      'Posts images and video to your Page',
      'Writes the post text in your brand voice',
      'Follow-up text posts as comments under the post',
      'Results for each post appear in your Genfeed analytics',
    ],
    formats: 'Image, video',
    icon: 'FacebookIcon',
    name: 'Facebook',
    results: 'Post results',
    slug: 'facebook',
    tagline: 'Image and video posts for your Facebook Page',
    workflow: [
      {
        description: 'Tell your agent what the Page should say.',
        step: 1,
        title: 'Brief',
      },
      {
        description: 'Genfeed makes the image or video and writes the post.',
        step: 2,
        title: 'Draft',
      },
      {
        description: 'Genfeed posts the approved draft to your Page.',
        step: 3,
        title: 'Post',
      },
      {
        description: 'Results come back to your analytics.',
        step: 4,
        title: 'Read results',
      },
    ],
  },
  {
    description:
      'Posts, images and video for X, with replies chained into a thread. Genfeed posts them to your account.',
    features: [
      'Posts text, images and video',
      'Posts a thread: the first post, then each reply in order',
      'Writes the posts in your brand voice',
      'Likes, comments and views for each post appear in your Genfeed analytics',
    ],
    formats: 'Text, image, video, thread',
    icon: 'XTwitterIcon',
    name: 'X',
    results: 'Likes, comments and views',
    slug: 'x-twitter',
    tagline: 'Posts and threads with images and video',
    workflow: [
      {
        description:
          'Give your agent an idea, a link or a product update to turn into posts.',
        step: 1,
        title: 'Brief',
      },
      {
        description:
          'Genfeed writes the post or thread and makes any image or video.',
        step: 2,
        title: 'Draft',
      },
      {
        description: 'Genfeed posts the approved draft to your account.',
        step: 3,
        title: 'Post',
      },
      {
        description: 'Likes, comments and views come back to your analytics.',
        step: 4,
        title: 'Read results',
      },
    ],
  },
  {
    description:
      'Images with a title and description, published as Pins on the board you choose.',
    features: [
      'Publishes image Pins to a board you pick',
      'Writes the Pin title and description',
      'Makes the images from the brief',
      'Likes, comments and views for each Pin appear in your Genfeed analytics',
    ],
    formats: 'Image',
    icon: 'PinterestIcon',
    name: 'Pinterest',
    results: 'Likes, comments and views',
    slug: 'pinterest',
    tagline: 'Image Pins with the title and description written',
    workflow: [
      {
        description: 'Tell your agent the topic and which board it belongs on.',
        step: 1,
        title: 'Brief',
      },
      {
        description: 'Genfeed makes the images and writes each Pin.',
        step: 2,
        title: 'Draft',
      },
      {
        description: 'Genfeed publishes the approved Pins to your board.',
        step: 3,
        title: 'Pin',
      },
      {
        description: 'Likes, comments and views come back to your analytics.',
        step: 4,
        title: 'Read results',
      },
    ],
  },
  {
    description:
      'A post written for the subreddit you choose, with an image or video if the brief calls for one.',
    features: [
      'Posts text, image and video to the subreddit you set',
      'Posts follow-up text as comments under your post',
      'Drafts the title and body from your brief',
    ],
    formats: 'Text, image, video',
    icon: 'RedditIcon',
    name: 'Reddit',
    slug: 'reddit',
    tagline: 'Posts for the subreddit you pick',
    workflow: [
      {
        description:
          'Tell your agent the subreddit and what you want to share.',
        step: 1,
        title: 'Brief',
      },
      {
        description:
          'Genfeed drafts the title and body. You review the draft in your dashboard.',
        step: 2,
        title: 'Draft',
      },
      {
        description: 'Genfeed posts the approved draft to that subreddit.',
        step: 3,
        title: 'Post',
      },
    ],
  },
  {
    description:
      'Generate images and videos from a slash command in your Discord server, using your Genfeed brand.',
    features: [
      'Use /prompt-image and /prompt-video in any channel the bot is in',
      'Use /set-brand to pick the brand the output follows',
      'Use /status to see your credit balance, active brand and brands',
      'Link your chat account to Genfeed in settings first, then every generation uses your credits',
    ],
    formats: 'Image, video from slash commands',
    icon: 'DiscordIcon',
    name: 'Discord',
    slug: 'discord',
    tagline: 'Image and video generation from a slash command',
    workflow: [
      {
        description: 'Connect the Genfeed bot to your Discord server.',
        step: 1,
        title: 'Connect',
      },
      {
        description:
          'Type /set-brand to choose which brand the bot generates for.',
        step: 2,
        title: 'Choose brand',
      },
      {
        description:
          'Type /prompt-image or /prompt-video with a prompt. Genfeed sends the result back to the channel.',
        step: 3,
        title: 'Generate',
      },
    ],
  },
  {
    description:
      'The Genfeed bot posts scheduled link drops, host prompts and context-aware questions in your Twitch chat during a stream.',
    features: [
      'Scheduled link drops for the links you set',
      'Scheduled prompts aimed at hosts or at the audience',
      'Questions written from what is being said on stream',
      'A cap on automatic posts per hour, and a manual override for the host',
    ],
    formats: 'Chat messages during a stream',
    icon: 'TwitchIcon',
    name: 'Twitch',
    slug: 'twitch',
    tagline: 'Link drops and prompts in your Twitch chat',
    workflow: [
      {
        description:
          'Add the links you want mentioned and choose how often the bot may post.',
        step: 1,
        title: 'Set up',
      },
      {
        description:
          'Start your stream. The bot posts link drops and prompts on the schedule you set.',
        step: 2,
        title: 'Go live',
      },
      {
        description:
          'Send a message yourself at any time, or override the topic mid-stream.',
        step: 3,
        title: 'Steer',
      },
    ],
  },
  {
    description:
      'Articles with a featured image, written from a brief and saved to your WordPress site as a draft or published.',
    features: [
      'Publishes articles to your WordPress site, as a draft or live',
      'Uses an image from the draft as the featured image',
      'Writes the article from a brief or an outline',
      'Sends the version you approved',
    ],
    formats: 'Article, featured image',
    icon: 'WordpressIcon',
    name: 'WordPress',
    slug: 'wordpress',
    tagline: 'Articles with a featured image, saved to your site',
    workflow: [
      {
        description: 'Give your agent a topic, a transcript or an outline.',
        step: 1,
        title: 'Brief',
      },
      {
        description: 'Genfeed writes the article and makes the featured image.',
        step: 2,
        title: 'Draft',
      },
      {
        description:
          'Genfeed sends the article to your site as a draft or publishes it.',
        step: 3,
        title: 'Publish',
      },
    ],
  },
  {
    description:
      'Video and images with a caption, posted to your Snapchat account.',
    features: [
      'Posts images and video',
      'Writes the caption in your brand voice',
      'Makes the video and images from a brief',
      'Posts the version you approved',
    ],
    formats: 'Image, video',
    icon: 'SnapchatIcon',
    name: 'Snapchat',
    slug: 'snapchat',
    tagline: 'Video and images with the caption written',
    workflow: [
      {
        description: 'Tell your agent what the clip or image should show.',
        step: 1,
        title: 'Brief',
      },
      {
        description: 'Genfeed makes the media and writes the caption.',
        step: 2,
        title: 'Draft',
      },
      {
        description: 'Genfeed posts the approved draft to your account.',
        step: 3,
        title: 'Post',
      },
    ],
  },
  {
    description:
      'Send a text message or an image to a WhatsApp number you set, written from a brief.',
    features: [
      'Sends text messages and single images',
      'Writes the message in your brand voice',
      'Sends to the recipient number set on the connection',
      'Sends the version you approved',
    ],
    formats: 'Text, image',
    icon: 'WhatsappIcon',
    name: 'WhatsApp',
    slug: 'whatsapp',
    tagline: 'Text and image messages to a number you set',
    workflow: [
      {
        description: 'Tell your agent what the message should say.',
        step: 1,
        title: 'Brief',
      },
      {
        description: 'Genfeed writes the message and makes an image if needed.',
        step: 2,
        title: 'Draft',
      },
      {
        description: 'Genfeed sends the approved message to your number.',
        step: 3,
        title: 'Send',
      },
    ],
  },
  {
    description:
      'Posts with images and video, and threads when one post is not enough. Genfeed posts them to your Mastodon account.',
    features: [
      'Posts text, images, video and image sets',
      'Posts a thread when the brief needs more than one post',
      'Writes the posts in your brand voice',
      'Results for each post appear in your Genfeed analytics',
    ],
    formats: 'Text, image, video, thread',
    icon: 'MastodonIcon',
    name: 'Mastodon',
    results: 'Post results',
    slug: 'mastodon',
    tagline: 'Posts and threads with images and video',
    workflow: [
      {
        description: 'Tell your agent what to post.',
        step: 1,
        title: 'Brief',
      },
      {
        description: 'Genfeed writes the post or thread and makes any media.',
        step: 2,
        title: 'Draft',
      },
      {
        description: 'Genfeed posts the approved draft to your account.',
        step: 3,
        title: 'Post',
      },
      {
        description: 'Results come back to your analytics.',
        step: 4,
        title: 'Read results',
      },
    ],
  },
  {
    description:
      'Articles with images, written from a brief and sent to your Ghost site as a draft or published.',
    features: [
      'Publishes articles to your Ghost site, as a draft or live',
      'Includes images in the article',
      'Connects with your Ghost Admin API key',
      'Writes the article from a brief, a transcript or an outline',
    ],
    formats: 'Article, images',
    icon: 'GhostIcon',
    name: 'Ghost',
    slug: 'ghost',
    tagline: 'Articles with images, sent to your Ghost site',
    workflow: [
      {
        description:
          'Connect your Ghost site with an Admin API key from your Ghost settings.',
        step: 1,
        title: 'Connect',
      },
      {
        description: 'Give your agent a topic, a transcript or an outline.',
        step: 2,
        title: 'Brief',
      },
      {
        description: 'Genfeed writes the article and makes the images.',
        step: 3,
        title: 'Draft',
      },
      {
        description:
          'Genfeed sends the article to Ghost as a draft or publishes it.',
        step: 4,
        title: 'Publish',
      },
    ],
  },
  {
    description:
      'Create a Shopify product listing from a brief: the title, the description and the product images.',
    features: [
      'Creates a product in your store with a title and HTML description',
      'Adds images from the draft as product images',
      'Writes the description from a brief or a product sheet',
      'Gives you the store link for the new product',
    ],
    formats: 'Product listing, images',
    icon: 'ShopifyIcon',
    name: 'Shopify',
    slug: 'shopify',
    tagline: 'Product listings with description and images',
    workflow: [
      {
        description:
          'Give your agent the product details, or a product sheet to work from.',
        step: 1,
        title: 'Brief',
      },
      {
        description: 'Genfeed writes the description and makes product images.',
        step: 2,
        title: 'Draft',
      },
      {
        description: 'Genfeed creates the product in your store.',
        step: 3,
        title: 'Create',
      },
    ],
  },
  {
    description:
      'Newsletter issues written from a brief and sent to your Beehiiv publication as a draft, or scheduled to send.',
    features: [
      'Creates a newsletter post in your publication, as a draft or confirmed',
      'Can schedule the issue for a time you approved',
      'Includes images in the issue',
      'Connects with your Beehiiv API key',
    ],
    formats: 'Newsletter issue, images',
    icon: 'Newspaper',
    name: 'Beehiiv',
    slug: 'beehiiv',
    tagline: 'Newsletter issues sent to your publication',
    workflow: [
      {
        description: 'Connect your publication with your Beehiiv API key.',
        step: 1,
        title: 'Connect',
      },
      {
        description:
          'Give your agent the topics, links or posts the issue should cover.',
        step: 2,
        title: 'Brief',
      },
      {
        description: 'Genfeed writes the issue and its title.',
        step: 3,
        title: 'Draft',
      },
      {
        description:
          'Genfeed creates the issue in Beehiiv as a draft, or schedules it.',
        step: 4,
        title: 'Send',
      },
    ],
  },
  {
    description:
      'Articles written from a brief and saved to your Medium account as a draft or published as a public story.',
    features: [
      'Publishes text articles to your Medium account',
      'Saves as a draft or publishes as a public story',
      'Writes the article from a brief, a transcript or an outline',
      'Sends the version you approved',
    ],
    formats: 'Article',
    icon: 'MediumIcon',
    name: 'Medium',
    slug: 'medium',
    tagline: 'Articles saved to Medium as drafts or stories',
    workflow: [
      {
        description: 'Give your agent a topic, a transcript or an outline.',
        step: 1,
        title: 'Brief',
      },
      {
        description: 'Genfeed writes the article.',
        step: 2,
        title: 'Draft',
      },
      {
        description:
          'Genfeed saves it to Medium as a draft or publishes it as a public story.',
        step: 3,
        title: 'Publish',
      },
    ],
  },
  {
    description:
      'Short posts, images and video for Threads, with replies chained into a thread. Genfeed posts them to your account.',
    features: [
      'Posts text, images, video and image sets',
      'Chains replies into a thread',
      'Writes the posts in your brand voice',
      'Results for each post appear in your Genfeed analytics',
    ],
    formats: 'Text, image, video, thread',
    icon: 'ThreadsIcon',
    name: 'Threads',
    results: 'Post results',
    slug: 'threads',
    tagline: 'Posts and threads with images and video',
    workflow: [
      {
        description: 'Tell your agent what to say.',
        step: 1,
        title: 'Brief',
      },
      {
        description: 'Genfeed writes the posts and makes any media.',
        step: 2,
        title: 'Draft',
      },
      {
        description: 'Genfeed posts the approved draft to your account.',
        step: 3,
        title: 'Post',
      },
      {
        description: 'Likes, comments and views come back to your analytics.',
        step: 4,
        title: 'Read results',
      },
    ],
  },
  {
    description:
      'Generate images and videos from a command in your Telegram chat, using your Genfeed brand.',
    features: [
      'Use /prompt_image and /prompt_video in a chat with the bot',
      'Use /set_brand to pick the brand the output follows',
      'Use /status to see your credit balance, active brand and brands',
      'Link your chat account to Genfeed in settings first, then every generation uses your credits',
    ],
    formats: 'Image, video from commands',
    icon: 'TelegramIcon',
    name: 'Telegram',
    slug: 'telegram',
    tagline: 'Image and video generation from a chat command',
    workflow: [
      {
        description: 'Connect the Genfeed bot to your Telegram chat.',
        step: 1,
        title: 'Connect',
      },
      {
        description: 'Send /set_brand to choose the brand the bot works for.',
        step: 2,
        title: 'Choose brand',
      },
      {
        description:
          'Send /prompt_image or /prompt_video with a prompt. Genfeed sends the result back to the chat.',
        step: 3,
        title: 'Generate',
      },
    ],
  },
  {
    description:
      'Generate images and videos from a slash command in your Slack workspace, using your Genfeed brand.',
    features: [
      'Use /prompt-image and /prompt-video in any channel the app is in',
      'Use /set-brand to pick the brand the output follows',
      'Use /status to see your credit balance, active brand and brands',
      'Link your chat account to Genfeed in settings first, then every generation uses your credits',
    ],
    formats: 'Image, video from slash commands',
    icon: 'SlackIcon',
    name: 'Slack',
    slug: 'slack',
    tagline: 'Image and video generation from a slash command',
    workflow: [
      {
        description: 'Add the Genfeed app to your Slack workspace.',
        step: 1,
        title: 'Connect',
      },
      {
        description:
          'Type /set-brand to choose which brand the app generates for.',
        step: 2,
        title: 'Choose brand',
      },
      {
        description:
          'Type /prompt-image or /prompt-video with a prompt. Genfeed sends the result back to the channel.',
        step: 3,
        title: 'Generate',
      },
    ],
  },
  {
    description:
      'Images and video for your Fanvue subscriber feed, made from a brief and posted to your creator account.',
    features: [
      'Posts text, images and video to your feed',
      'Writes captions in your voice',
      'Makes images and video from a brief',
      'Posts the version you approved',
    ],
    formats: 'Text, image, video',
    icon: 'Star',
    name: 'Fanvue',
    slug: 'fanvue',
    tagline: 'Images and video for your subscriber feed',
    workflow: [
      {
        description: 'Connect your Fanvue creator account.',
        step: 1,
        title: 'Connect',
      },
      {
        description: 'Tell your agent what the post should show.',
        step: 2,
        title: 'Brief',
      },
      {
        description: 'Genfeed makes the media and writes the caption.',
        step: 3,
        title: 'Draft',
      },
      {
        description: 'Genfeed posts the approved draft to your feed.',
        step: 4,
        title: 'Post',
      },
    ],
  },
];

export function getIntegrationBySlug(slug: string): Integration | undefined {
  return integrations.find((i) => i.slug === slug);
}

export function getAllIntegrationSlugs(): string[] {
  return integrations.map((i) => i.slug);
}

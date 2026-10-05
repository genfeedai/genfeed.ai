import { ArticleCategory } from '@genfeedai/contracts';
import { buildSeoArticle, type SeoArticleBrief } from './seo-article-builder';

const GENFEED_PLATFORMS = [
  'X',
  'Instagram',
  'TikTok',
  'YouTube',
  'Facebook',
  'LinkedIn',
  'Pinterest',
  'Reddit',
  'Threads',
  'WordPress',
  'Snapchat',
  'Mastodon',
  'Ghost',
  'Shopify',
  'Beehiiv',
  'Fanvue',
] as const;

const CONNECT_PROMPT =
  'Add Genfeed as a custom connector. MCP server URL: https://mcp.genfeed.ai/mcp. Transport: remote Streamable HTTP. Authentication: OAuth. Send me the sign-in link and wait while I approve access in my browser. Never ask me for a password, token, or API key in this chat. After I approve, list my Genfeed brands to confirm the connection works. Before publishing anything, show me the draft and wait for my approval.';

const mcpLinks = [
  { label: "Genfeed's hosted MCP server", url: 'https://mcp.genfeed.ai' },
  { label: 'Genfeed pricing', url: 'https://genfeed.ai/pricing' },
  { label: 'Explore Genfeed', url: 'https://genfeed.ai/' },
  { label: 'Read the Genfeed documentation', url: 'https://docs.genfeed.ai/' },
] as const;

const briefs: readonly SeoArticleBrief[] = [
  {
    answer:
      'Meta Muse does not list Genfeed among its built-in connectors, but you can add it yourself: open a Muse chat, ask it to create a custom connector, and give it Genfeed’s hosted MCP server address, https://mcp.genfeed.ai/mcp, over remote Streamable HTTP with OAuth. Muse sends you a sign-in link, you approve access in your browser, and from then on Muse can draft captions, images, and schedules through Genfeed — with every draft held for your review before it publishes.',
    category: ArticleCategory.TUTORIAL,
    decisionRows: [
      {
        choice: 'Muse’s built-in connector list',
        fit: 'Apps already in Muse’s fixed catalog, ready with no setup',
        tradeoff:
          'Genfeed is not on that list, so scheduling stays unavailable through it alone',
      },
      {
        choice: 'Custom connector to Genfeed’s MCP server',
        fit: 'Any brand, model, or platform Genfeed supports, added once in chat',
        tradeoff:
          'You ask Muse to create it yourself; there is no toggle in settings',
      },
      {
        choice: 'OAuth sign-in',
        fit: 'Muse gets scoped access without ever seeing a password or API key',
        tradeoff:
          'You approve the sign-in link in a browser tab before the first session works',
      },
      {
        choice: 'Held drafts',
        fit: 'A person reviews every caption, image, and schedule before it goes out',
        tradeoff: 'Muse cannot publish instantly on its own',
      },
    ],
    faq: [
      {
        question: 'Is Meta Muse the same as Meta AI?',
        answer:
          'No. Meta AI is the assistant built into Facebook, Instagram, and Messenger. Muse is a separate personal AI agent that completes tasks through connectors.',
      },
      {
        question: 'Do I need a Genfeed API key to connect Muse?',
        answer:
          'No. The hosted MCP server authenticates through OAuth with dynamic client registration, so there is no API key to generate or paste into the chat.',
      },
      {
        question: 'Can Muse publish a post without my approval?',
        answer:
          'Genfeed holds generated content as a draft by default, so a person reviews and approves it before it reaches any platform.',
      },
      {
        question: 'Which platforms can Muse schedule to through Genfeed?',
        answer:
          'Every destination Genfeed supports: X, Instagram, TikTok, YouTube, Facebook, LinkedIn, Pinterest, Reddit, Threads, WordPress, Snapchat, Mastodon, Ghost, Shopify, Beehiiv, and Fanvue.',
      },
      {
        question: 'Is Genfeed an official Muse connector?',
        answer:
          'No. Genfeed is not part of Muse’s built-in connector directory. It connects as a custom connector you add yourself using Genfeed’s MCP server.',
      },
      {
        question: 'What happens if I revoke access later?',
        answer:
          'Removing the custom connector in Muse ends its OAuth session. Drafts and published history already in your Genfeed workspace are unaffected.',
      },
      {
        question: 'Can one connector cover more than one brand?',
        answer:
          'Yes. Ask Muse to list your Genfeed brands and say which one a request applies to before it drafts anything.',
      },
    ],
    internalLinks: [
      { label: 'Genfeed for Meta Muse', url: 'https://genfeed.ai/muse' },
      ...mcpLinks,
    ],
    intro: [
      'Meta Muse is Meta’s personal AI agent, not the Meta AI assistant built into Facebook, Instagram, and Messenger. Muse acts on your behalf through connectors — small bridges to the services you already use — and its built-in list is fixed, so a newer content platform like Genfeed will not appear there automatically.',
      'The workaround is the same one Muse supports for any service outside that list: a custom connector pointed at an MCP server. Genfeed runs a hosted MCP server built for exactly this, so setup is a short chat message and one browser approval, not a settings form.',
    ],
    label:
      'Meta Muse Connectors: How to Schedule Social Media Posts With Genfeed',
    metrics: [
      'Drafts approved as-is versus edited before publish',
      'Time from a Muse chat request to an approved, scheduled post',
      'Reconnect or OAuth failures per month',
      'Brands and platforms actually used through the connector versus connected',
    ],
    mistakes: [
      'Looking for Genfeed in Muse’s built-in connector list instead of adding it as a custom connector',
      'Giving Muse a password, token, or API key when it only ever needs the OAuth sign-in link',
      'Letting a queued post publish without opening the draft in Genfeed first',
      'Approving the OAuth sign-in from the wrong Genfeed organization or brand',
    ],
    publishedAt: '2026-12-01T09:00:00.000Z',
    sections: [
      {
        heading: 'Which platforms Genfeed can publish to from Muse',
        paragraphs: [
          'Once the connector is live, Muse is really talking to Genfeed’s own publishing layer, not to each network directly. The same brand, asset, and approval rules apply no matter which platform a post is headed to.',
          'Genfeed currently publishes to sixteen destinations, so a request such as “post this to Instagram and Threads” or “queue this for LinkedIn next week” routes through one connector instead of one integration per app.',
        ],
        points: [...GENFEED_PLATFORMS],
      },
      {
        heading: 'Keep a human between Muse and the publish button',
        paragraphs: [
          'Muse never needs your Genfeed password or an API key for this connector — access runs on OAuth, so it opens a sign-in link and waits for you to approve it in a real browser tab. If a chat message ever asks you to paste a password or token instead, that is not how this connection is supposed to work; stop and check the source.',
          'Genfeed holds generated captions, images, and schedules as drafts by default. Muse can prepare and even queue a post, but a person still has to open the draft and approve it before it goes out, which is the difference between a fast production step and an unsupervised one.',
        ],
      },
      {
        heading: 'Troubleshooting the Muse connector',
        paragraphs: [
          'If Muse says it cannot reach the server, confirm you gave it the exact address, https://mcp.genfeed.ai/mcp, and chose remote Streamable HTTP rather than a local command — Muse’s bridge only proxies to a reachable URL, it does not run Genfeed on your behalf.',
          'If the brand list comes back empty after you approve the sign-in link, the OAuth approval likely did not complete. Ask Muse to reconnect and re-open the link, and check that you were signed into the intended Genfeed organization when you approved it.',
        ],
      },
    ],
    slug: 'meta-muse-connectors-schedule-social-media-posts',
    sources: [
      {
        label: 'Meta: Introducing Muse, a personal AI agent',
        url: 'https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/',
      },
      { label: 'Muse product page', url: 'https://ai.meta.com/muse/' },
      {
        label: 'Model Context Protocol specification',
        url: 'https://modelcontextprotocol.io/specification/2025-11-25',
      },
      {
        label: 'MCP authorization (OAuth) specification',
        url: 'https://modelcontextprotocol.io/specification/draft/basic/authorization',
      },
    ],
    summary:
      'Add Genfeed as a custom connector in Meta Muse, schedule posts across 16 platforms, and keep a human review gate before anything publishes.',
    workflow: [
      {
        action: 'Open a chat with Muse.',
        detail:
          'Use the account where you want the connector to live — Muse’s connectors are personal to that account.',
      },
      {
        action: 'Paste the connect request.',
        detail: `Send: “${CONNECT_PROMPT}”`,
      },
      {
        action: 'Approve the sign-in link.',
        detail:
          'Muse opens a browser tab for Genfeed’s OAuth flow; sign in and grant access there, not in the chat.',
      },
      {
        action: 'Confirm the brand list.',
        detail:
          'Ask Muse to list your Genfeed brands — if it can, the connector is authenticated and scoped correctly.',
      },
      {
        action: 'Ask for a draft, not a publish.',
        detail:
          'Have Muse prepare a caption, image, or schedule and hold it as a draft in Genfeed for you to review.',
      },
      {
        action: 'Approve inside Genfeed.',
        detail:
          'Open the draft in Genfeed, edit if needed, and approve it there before it reaches any platform.',
      },
    ],
  },
  {
    answer:
      'Grok Bot is xAI and Cursor’s always-on AI teammate: each Bot runs on its own persistent cloud computer and can keep working after you close the chat. Connect it to Genfeed the same way you would connect any other tool — point it at Genfeed’s hosted MCP server, https://mcp.genfeed.ai/mcp, over remote Streamable HTTP, approve the OAuth sign-in link once, and the Bot can then draft captions, images, and schedules through Genfeed while a person still approves what actually publishes.',
    category: ArticleCategory.TUTORIAL,
    decisionRows: [
      {
        choice: 'A Bot’s own persistent cloud computer',
        fit: 'Long-running or scheduled jobs that need to survive after you close the chat',
        tradeoff:
          'The Bot can act while you are away, so a review gate matters more, not less',
      },
      {
        choice: 'Built-in connectors and plugins',
        fit: 'Services already wired into the Grok Bot catalog',
        tradeoff:
          'Genfeed reaches a Bot through its own MCP server, not that catalog',
      },
      {
        choice: 'Remote MCP server (Genfeed)',
        fit: 'Content briefs, drafts, scheduling, and analytics in one workspace',
        tradeoff:
          'Set up once per Bot; it does not inherit from your personal Grok chat',
      },
      {
        choice: 'Draft-first publishing',
        fit: 'Keeps a person accountable for what goes out while the Bot runs unattended',
        tradeoff:
          'A fully unattended posting loop is not the default, by design',
      },
    ],
    faq: [
      {
        question: 'Is Grok Bot the same as Grok?',
        answer:
          'No. Grok is xAI’s chat assistant. Grok Bot is a separate always-on AI teammate that runs on its own persistent cloud computer and can work while you are offline.',
      },
      {
        question: 'Does Genfeed need an API key to work with Grok Bot?',
        answer:
          'No. The hosted MCP server authenticates through OAuth with dynamic client registration, so no API key is generated or shared in chat.',
      },
      {
        question: 'Can a Bot publish a post without approval while I’m away?',
        answer:
          'Not by default. Genfeed holds generated content as a draft, so a person still approves it before it reaches a platform, even if the Bot produced it unattended.',
      },
      {
        question: 'Which platforms can a Bot schedule to through Genfeed?',
        answer:
          'All of Genfeed’s supported destinations: X, Instagram, TikTok, YouTube, Facebook, LinkedIn, Pinterest, Reddit, Threads, WordPress, Snapchat, Mastodon, Ghost, Shopify, Beehiiv, and Fanvue.',
      },
      {
        question: 'Do I need a specific plan to use Grok Bot at all?',
        answer:
          'You need whichever plan xAI and Cursor require for Grok Bot access. That requirement is separate from Genfeed’s own setup, which only needs the MCP connector.',
      },
      {
        question: 'Does connecting one Bot connect all of them?',
        answer:
          'No. Connector setup is per Bot, so repeat the same connect prompt for each Bot that needs Genfeed access.',
      },
      {
        question: 'What happens if I revoke the connector?',
        answer:
          'The Bot loses access on its next attempt. Drafts, approvals, and published history already in Genfeed are unaffected.',
      },
    ],
    internalLinks: [
      { label: 'Genfeed for Grok Bot', url: 'https://genfeed.ai/grok-bot' },
      { label: 'Genfeed for Grok', url: 'https://genfeed.ai/grok' },
      ...mcpLinks,
    ],
    intro: [
      'Grok Bot, launched in beta on August 11, 2026, is different from the Grok chat assistant: instead of answering inside one conversation, each Bot gets its own persistent cloud computer — a browser, filesystem, and terminal — and can keep running a job after you have moved on to something else.',
      'That persistence is exactly why a review gate matters more, not less. Connecting a Bot to Genfeed over MCP gives it a real publishing workflow to draft and schedule content, while Genfeed keeps every generated post as a draft until a person approves it.',
    ],
    label:
      'Grok Bot + Genfeed: Automate Social Media Posting With an Always-On AI Teammate',
    metrics: [
      'Routines completed without needing a manual fix',
      'Drafts approved as-is versus edited before publish',
      'Time from routine start to an approved, scheduled post',
      'Reconnect or OAuth failures per Bot per month',
    ],
    mistakes: [
      'Assuming a connector added in one Bot carries over to every other Bot',
      'Giving a Bot an unbounded “keep posting” routine before testing one draft end to end',
      'Treating a stalled routine as broken when it is actually waiting on a held draft',
      'Pasting a password or API key into the Bot’s chat instead of using the OAuth link',
    ],
    publishedAt: '2026-12-03T09:00:00.000Z',
    sections: [
      {
        heading: 'Which platforms a Bot can post to through Genfeed',
        paragraphs: [
          'A Grok Bot reaches social platforms the same way Genfeed does for any other client: through Genfeed’s own connectors, not by xAI or Cursor building one integration per network.',
          'That currently covers sixteen destinations, so a routine that says “draft this week’s LinkedIn and X posts” or “queue the Shopify product update” runs through the one Genfeed connector.',
        ],
        points: [...GENFEED_PLATFORMS],
      },
      {
        heading: 'Why the review gate matters more for an unattended Bot',
        paragraphs: [
          'A Bot can run a routine while you are offline, which means nobody is watching the exact moment it decides a post is ready. Genfeed’s draft-and-approve model is the backstop: generated captions, images, and schedules wait for a person before they reach a platform, regardless of when the Bot produced them.',
          'The connector never asks for your Genfeed password or an API key either. It authenticates through OAuth, so the Bot sends you a sign-in link and waits for approval in a real browser session, the same as any other MCP client.',
        ],
      },
      {
        heading: 'Troubleshooting the Grok Bot connection',
        paragraphs: [
          'If the Bot cannot find Genfeed’s tools, check that it was given the exact server address, https://mcp.genfeed.ai/mcp, over remote Streamable HTTP — connector setup is per Bot, so a working connection in your personal Grok chat does not carry over automatically.',
          'If a routine stalls waiting on Genfeed, it is usually waiting on a held draft. Open Genfeed directly to approve or reject the pending item rather than assuming the Bot itself is stuck.',
        ],
      },
    ],
    slug: 'grok-bot-social-media-automation',
    sources: [
      {
        label: 'xAI: Introducing Grok Bot',
        url: 'https://x.ai/news/introducing-grok-bot',
      },
      { label: 'Grok Bot product page', url: 'https://x.ai/bot' },
      {
        label: 'Cursor community: Introducing Grok Bot',
        url: 'https://forum.cursor.com/t/introducing-grok-bot/168053',
      },
      {
        label: 'Model Context Protocol specification',
        url: 'https://modelcontextprotocol.io/specification/2025-11-25',
      },
    ],
    summary:
      'Connect xAI and Cursor’s Grok Bot to Genfeed over MCP so it can draft and schedule social posts, with every post held for human approval first.',
    workflow: [
      {
        action: 'Open the Bot you want to connect.',
        detail:
          'Connector setup is per Bot, not shared across your whole Grok account.',
      },
      {
        action: 'Ask it to add a custom MCP connector.',
        detail: `Send: “${CONNECT_PROMPT}”`,
      },
      {
        action: 'Approve the OAuth link in your browser.',
        detail:
          'The Bot cannot complete the connection until you sign in and grant access outside the chat.',
      },
      {
        action: 'Verify with a brand list.',
        detail:
          'Ask the Bot to list your Genfeed brands; a correct list confirms the connector is authenticated.',
      },
      {
        action: 'Give it a bounded first routine.',
        detail:
          'Start with one draft task, such as preparing captions for an existing content plan, rather than an open-ended posting loop.',
      },
      {
        action: 'Review drafts inside Genfeed.',
        detail:
          'Approve or edit what the Bot produced before anything schedules or publishes.',
      },
    ],
  },
  {
    answer:
      'Add Genfeed to Claude Code with one command: claude mcp add --transport http genfeed --scope user https://mcp.genfeed.ai/mcp/claude. Then open /mcp, select genfeed, and authenticate in your browser. Verify with claude mcp list and by asking Claude Code to list your Genfeed brands. From there Claude Code can draft captions and schedule existing assets through Genfeed; create images, video and audio in Genfeed Studio, which holds every draft for review before it publishes. Codex users use the standard /mcp endpoint with codex mcp add and codex mcp login.',
    category: ArticleCategory.TUTORIAL,
    decisionRows: [
      {
        choice: 'OAuth browser sign-in (default)',
        fit: 'Personal, interactive use where you can approve a browser prompt',
        tradeoff: 'Needs a browser session available when you connect',
      },
      {
        choice: 'Scoped API key in GENFEED_API_KEY',
        fit: 'Headless environments, CI, or automation without a browser',
        tradeoff:
          'You own key rotation and scope; never paste it into a command or chat',
      },
      {
        choice: '--scope user',
        fit: 'Personal setup available across every project on your machine',
        tradeoff: 'Not shared with teammates or committed to a repo',
      },
      {
        choice: 'Codex CLI equivalent',
        fit: 'Teams standardizing on Codex instead of, or alongside, Claude Code',
        tradeoff:
          'A separate login step, codex mcp login, and its own connector list',
      },
    ],
    faq: [
      {
        question: 'Do I need an API key to connect Claude Code to Genfeed?',
        answer:
          'No, not by default. The hosted MCP server authenticates through OAuth in your browser. A scoped API key in GENFEED_API_KEY is only a fallback for headless setups without a browser.',
      },
      {
        question: 'What does --scope user do?',
        answer:
          'It stores the connection for your user account across every project on that machine, instead of a single project’s .mcp.json.',
      },
      {
        question: 'How do I confirm the connection worked?',
        answer:
          'Run claude mcp list to see genfeed listed as connected, then ask Claude Code to list your Genfeed brands.',
      },
      {
        question: 'Can Claude Code publish a post directly?',
        answer:
          'It can draft and queue content through Genfeed, but Genfeed holds drafts for review, so a person approves the post before it reaches a platform.',
      },
      {
        question: 'Does Codex use the same setup?',
        answer:
          'Codex reaches the same MCP server with its own commands: codex mcp add genfeed --url https://mcp.genfeed.ai/mcp, followed by codex mcp login genfeed.',
      },
      {
        question: 'Which platforms can I schedule to?',
        answer:
          'Every destination Genfeed supports: X, Instagram, TikTok, YouTube, Facebook, LinkedIn, Pinterest, Reddit, Threads, WordPress, Snapchat, Mastodon, Ghost, Shopify, Beehiiv, and Fanvue.',
      },
      {
        question: 'What if the OAuth session expires?',
        answer:
          'Re-run /mcp, select genfeed, and re-authenticate. Claude Code does not silently fall back to a stored password, because there isn’t one.',
      },
    ],
    internalLinks: [
      {
        label: 'Genfeed for Claude Code',
        url: 'https://genfeed.ai/claude-code',
      },
      { label: 'Genfeed for Codex', url: 'https://genfeed.ai/codex' },
      ...mcpLinks,
    ],
    intro: [
      'Claude Code and Codex are coding-agent CLIs, not social apps, so connecting one to Genfeed is a command-line task rather than a settings toggle: add the server, authenticate once in a browser, and verify the connection before asking either tool to do anything with your content.',
      'Genfeed’s hosted MCP server takes remote Streamable HTTP and OAuth, so a typical setup needs no API key. A scoped API key remains available as a fallback for headless environments where no browser is available — kept in an environment variable, never typed into a command.',
    ],
    label:
      'How to Schedule Social Media Posts From Claude Code (MCP Setup Guide)',
    metrics: [
      'claude mcp list checks that report a healthy connection',
      'Drafts approved as-is versus edited before publish',
      'Time from claude mcp add to a verified brand list',
      'OAuth reconnects or expired sessions per month',
    ],
    mistakes: [
      'Adding the server without --scope user, then not finding it in a different project',
      'Pasting a GENFEED_API_KEY value directly into a claude mcp add command instead of an environment variable',
      'Assuming a queued draft has published without checking Genfeed directly',
      'Skipping claude mcp list and only trusting that /mcp opened once',
    ],
    publishedAt: '2026-12-08T09:00:00.000Z',
    sections: [
      {
        heading: 'Which platforms Claude Code can schedule to',
        paragraphs: [
          'Claude Code talks to Genfeed’s own publishing layer through MCP, so the same sixteen destinations are available whether you ask it to draft one post or plan a week of content.',
          'A request such as “draft next week’s X and LinkedIn posts for the launch brand” routes through the one Genfeed connector rather than a separate integration per platform.',
        ],
        points: [...GENFEED_PLATFORMS],
      },
      {
        heading: 'Keep a review gate between the CLI and the publish button',
        paragraphs: [
          'Genfeed holds generated captions, images, and schedules as drafts by default, so Claude Code can prepare and even queue content without a person’s attention being the only thing standing between a prompt and a published post.',
          'Claude requires browser OAuth on the dedicated /mcp/claude endpoint. The scoped API key fallback applies to other clients; keep credentials out of prompts and committed config files.',
        ],
      },
      {
        heading: 'Troubleshooting the MCP connection',
        paragraphs: [
          'If /mcp does not list genfeed, confirm the server was added with claude mcp add --transport http genfeed --scope user https://mcp.genfeed.ai/mcp/claude and that the scope matches where you are running Claude Code — a project-scoped and a user-scoped entry are tracked separately.',
          'If claude mcp list shows genfeed but a brand request fails, the OAuth session likely expired. Re-run /mcp, select genfeed, and re-authenticate in the browser rather than assuming the server is down.',
        ],
      },
    ],
    slug: 'schedule-social-media-posts-claude-code-mcp',
    sources: [
      {
        label: 'Claude Code docs: Connect to tools via MCP',
        url: 'https://code.claude.com/docs/en/mcp',
      },
      {
        label: 'OpenAI: Model Context Protocol for Codex',
        url: 'https://developers.openai.com/codex/mcp',
      },
      {
        label: 'Model Context Protocol specification',
        url: 'https://modelcontextprotocol.io/specification/2025-11-25',
      },
      {
        label: 'MCP authorization (OAuth) specification',
        url: 'https://modelcontextprotocol.io/specification/draft/basic/authorization',
      },
    ],
    summary:
      'Connect Claude Code to Genfeed with one MCP command, verify with claude mcp list, and schedule social posts behind a draft-review gate.',
    workflow: [
      {
        action: 'Add the server.',
        detail:
          'Run claude mcp add --transport http genfeed --scope user https://mcp.genfeed.ai/mcp/claude in your terminal.',
      },
      {
        action: 'Open the MCP menu.',
        detail: 'Run /mcp inside Claude Code and select genfeed from the list.',
      },
      {
        action: 'Authenticate in your browser.',
        detail:
          'Approve the OAuth sign-in link that opens; Claude Code never needs a password or API key for this step.',
      },
      {
        action: 'Verify the connection.',
        detail: 'Run claude mcp list to confirm genfeed shows as connected.',
      },
      {
        action: 'Confirm with a real request.',
        detail:
          'Ask Claude Code to list your Genfeed brands; a correct answer confirms authentication and scope.',
      },
      {
        action: 'Review drafts in Genfeed.',
        detail:
          'Approve or edit anything Claude Code prepares before it schedules or publishes.',
      },
    ],
  },
];

export const SEO_ARTICLES_WAVE_4 = briefs.map(buildSeoArticle);

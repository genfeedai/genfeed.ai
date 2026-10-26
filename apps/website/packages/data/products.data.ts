import type { PlanTier } from '@genfeedai/pricing';

export interface Product {
  slug: string;
  name: string;
  tagline: string;
  /**
   * SERP title, brand suffix excluded. `name | tagline` blew past the 60-char
   * budget on the longer taglines, so those products spell the title out here.
   */
  seoTitle?: string;
  headline: string;
  description: string;
  icon: string;
  category: string;
  features: {
    title: string;
    description: string;
    icon: string;
  }[];
  benefits: {
    problem: string;
    solution: string;
  }[];
  useCases: {
    title: string;
    description: string;
    example: string;
  }[];
  targetAudience: string[];
  integrations?: string[];
  pricing: {
    /** Stable tier id; the display name is resolved via getPlanLabel at render. */
    recommended: PlanTier;
    why: string;
  };
  librarySections?: {
    title: string;
    description?: string;
    agents: {
      name: string;
      description: string;
    }[];
  }[];
  relatedProducts: string[];
  cta: string;
  githubUrl?: string;
  status?: 'alpha' | 'beta' | 'coming-soon' | 'available';
}

export const products: Product[] = [
  {
    benefits: [
      {
        problem:
          'Operating every Genfeed capability through separate surfaces slows work down',
        solution:
          'One agent interface can operate content, publishing, workflows, and follow-up actions from a single command loop',
      },
      {
        problem: 'Autonomous work often feels unpredictable and hard to trust',
        solution:
          'Agents trigger deterministic workflows, scheduled runs, and quality checks with inspectable execution',
      },
      {
        problem: 'Different channels need different operating behaviors',
        solution:
          'Use specialized agents for chat, DMs, replies, workflows, and content generation without switching systems',
      },
      {
        problem:
          'Scaling output means coordinating generation, review, and publishing continuously',
        solution:
          'Agents can run autonomously on schedules, generate ingredients, rate outputs, and hand execution to workflows',
      },
    ],
    category: 'Agent System',
    cta: 'Open Agent Library',
    description:
      'Operate Genfeed through a unified agent interface. Use specialized agents for social engagement, workflow orchestration, and content production, then let them trigger deterministic workflows on demand or on schedule.',
    features: [
      {
        description:
          'A single interface for operating Genfeed products, content systems, and automation without jumping between tools.',
        icon: '',
        title: 'Unified Agent Interface',
      },
      {
        description:
          'Agents can autonomously trigger deterministic workflows, scheduled runs, generation loops, and rating passes.',
        icon: '',
        title: 'Autonomous Execution',
      },
      {
        description:
          'Choose from specialized agents for Twitch and YouTube chat, Instagram and X DMs, replies, workflow orchestration, and content production.',
        icon: '',
        title: 'Agent Library',
      },
      {
        description:
          'Every agent can hand off to deterministic workflows when you need explicit triggers, step logic, and controlled execution.',
        icon: '',
        title: 'Workflow Triggering',
      },
    ],
    headline: 'A Unified Agent System for Deterministic AI Work',
    icon: '',
    integrations: [
      'X/Twitter',
      'Instagram',
      'Twitch',
      'YouTube',
      'Articles',
      'Newsletters',
      'Deterministic Workflows',
    ],
    librarySections: [
      {
        agents: [
          {
            description:
              'Moderate Twitch chat, react to live events, and keep conversations on-brand.',
            name: 'Twitch Chat Agent',
          },
          {
            description:
              'Handle YouTube live chat, moderation, and audience engagement during streams and premieres.',
            name: 'YouTube Chat Agent',
          },
          {
            description:
              'Manage Instagram DMs, trigger follow-ups, and route high-intent conversations.',
            name: 'Instagram DM Agent',
          },
          {
            description:
              'Run X replies and DMs with deterministic follow-up logic and escalation paths.',
            name: 'X Reply + DM Agents',
          },
        ],
        description:
          'Agents that handle real-time conversations, moderation, and outbound engagement.',
        title: 'Social / Engagement Agents',
      },
      {
        agents: [
          {
            description:
              'Trigger workflows from natural-language requests and pass the right context into execution.',
            name: 'Workflow Trigger Agent',
          },
          {
            description:
              'Monitor running workflows, inspect outputs, and escalate or retry based on deterministic conditions.',
            name: 'Workflow Coordination Agent',
          },
          {
            description:
              'Schedule recurring workflow runs for generation and publishing, with review steps where you add them.',
            name: 'Scheduled Execution Agent',
          },
        ],
        description:
          'Agents that orchestrate and supervise deterministic workflow execution.',
        title: 'Workflow Agents',
      },
      {
        agents: [
          {
            description:
              'Generate, revise, and queue Instagram content using your existing brand and workflow setup.',
            name: 'Instagram Content Agent',
          },
          {
            description:
              'Create X posts and threads, then pass them into publishing or review workflows.',
            name: 'X Content Agent',
          },
          {
            description:
              'Draft, structure, and refine long-form articles with workflow-backed quality gates.',
            name: 'Article Agent',
          },
          {
            description:
              'Plan and generate newsletters, then route them into deterministic approval and send flows.',
            name: 'Newsletter Agent',
          },
        ],
        description:
          'Agents specialized for generating channel-specific content with autonomous follow-through.',
        title: 'Content Agents',
      },
    ],
    name: 'Hire Agents',
    pricing: {
      recommended: 'scale',
      why: 'Includes the full agent library, autonomous scheduled execution, and the workflow capacity needed to run deterministic agentic systems in production.',
    },
    relatedProducts: ['mcp', 'chatgpt', 'cursor'],
    slug: 'hire-agents',
    tagline: 'One interface, many agents, deterministic execution',
    targetAudience: [
      'Operators running multiple Genfeed products',
      'Teams that want autonomous execution without losing control',
      'Growth and engagement teams managing conversations at scale',
      'Content teams coordinating generation and publishing',
      'Agencies building repeatable agent-driven systems',
    ],
    useCases: [
      {
        description:
          'Run a unified command layer across Genfeed without touching separate tools for every task',
        example:
          'Tell the agent to generate ingredients, route them into workflows, rate outputs, and publish the approved result',
        title: 'Unified Operations',
      },
      {
        description:
          'Handle live and asynchronous engagement with specialized agents',
        example:
          'Twitch chat agent moderates live chat while X and Instagram agents handle replies and DMs from the same operating layer',
        title: 'Engagement Coverage',
      },
      {
        description:
          'Schedule autonomous execution that still runs through deterministic steps',
        example:
          'A scheduled content agent generates X posts and newsletter drafts nightly, then triggers workflow-based review and publishing steps',
        title: 'Autonomous Agentic Loops',
      },
    ],
  },
  {
    benefits: [
      {
        problem: 'Switching between ChatGPT and Genfeed to check stats',
        solution:
          'View Genfeed dashboards directly in ChatGPT without switching apps',
      },
      {
        problem: 'Missing trending topics while working in ChatGPT',
        solution:
          'Access real-time social trends without leaving your workflow',
      },
      {
        problem: 'Want to check credits and usage quickly',
        solution:
          'Quick access to account stats and remaining generation credits',
      },
      {
        problem: 'Need to preview content while planning',
        solution: 'View your recent Genfeed content directly in ChatGPT',
      },
    ],
    category: 'Integration',
    cta: 'Connect ChatGPT',
    description:
      'Access your Genfeed analytics, credits, and trending topics directly from ChatGPT. Monitor your workspace without leaving your chat interface.',
    features: [
      {
        description:
          'View your Genfeed credits, usage stats, and analytics from ChatGPT.',
        icon: '',
        title: 'Dashboard Access',
      },
      {
        description:
          "See what's trending across social platforms without leaving ChatGPT.",
        icon: '',
        title: 'Trending Topics',
      },
      {
        description:
          'Preview your Genfeed videos, images, and articles in ChatGPT.',
        icon: '',
        title: 'Content Preview',
      },
      {
        description:
          'Check your publishing schedule, recent activity, and performance metrics.',
        icon: '',
        title: 'Quick Stats',
      },
    ],
    headline: 'View Genfeed Dashboards in ChatGPT',
    icon: '',
    integrations: ['ChatGPT', 'OpenAI API'],
    name: 'ChatGPT Integration',
    pricing: {
      recommended: 'scale',
      why: 'Includes ChatGPT integration, unlimited commands, and advanced workflow automation.',
    },
    relatedProducts: ['mcp', 'hire-agents', 'cursor'],
    seoTitle: 'ChatGPT Integration for Genfeed',
    slug: 'chatgpt',
    tagline: 'Access Genfeed data from ChatGPT',
    targetAudience: [
      'ChatGPT power users',
      'Content creators using AI',
      'Marketers who live in ChatGPT',
      'Developers building workflows',
      'Teams preferring chat interfaces',
    ],
    useCases: [
      {
        description: 'Generate content from ChatGPT in seconds',
        example:
          '"Create 5 TikTok videos about AI trends and schedule for this week" → Waiting for your approval',
        title: 'Quick Content Creation',
      },
      {
        description: 'Execute complex multi-step workflows with one prompt',
        example:
          '"Generate article about AI, create Twitter thread from it, schedule both" → Automated',
        title: 'Workflow Chaining',
      },
      {
        description: 'Manage Genfeed while working in ChatGPT',
        example:
          'Brainstorming in ChatGPT → "Post this as tweet" → Draft waiting for your approval',
        title: 'Hands-Free Management',
      },
    ],
  },
  {
    benefits: [
      {
        problem: 'Your AI agent can write a post but cannot publish it',
        solution:
          'Genfeed MCP gives the agent real tools: generate media, schedule, publish, and read analytics',
      },
      {
        problem: 'Every agent needs its own custom integration',
        solution:
          'Connect Claude for brands, drafts, scheduling and analytics, with media creation in Genfeed Studio. Other agents use the full creative connector',
      },
      {
        problem: 'Pasting API keys into chats and config files',
        solution:
          'Browser OAuth by default. Scoped API keys stay an advanced fallback for clients without OAuth',
      },
      {
        problem: 'An agent publishing something you never saw',
        solution:
          'Drafts wait in review. You approve before anything goes to a connected channel',
      },
    ],
    category: 'Developer Tools',
    cta: 'Connect your agent',
    description:
      'Connect any AI agent to Genfeed with the Model Context Protocol. Browser OAuth and tools to draft, schedule, publish and measure content. Claude connects to content operations and opens Genfeed Studio for media creation; other agents can generate through MCP.',
    features: [
      {
        description:
          'Hosted Streamable HTTP server at https://mcp.genfeed.ai/mcp. No local install.',
        icon: '',
        title: 'One Hosted Endpoint',
      },
      {
        description:
          'Sign in and approve access in the browser. No API key in chats or config files.',
        icon: '',
        title: 'Browser OAuth',
      },
      {
        description:
          'Generate images and video, draft posts, schedule, and publish to connected channels.',
        icon: '',
        title: 'Create and Publish',
      },
      {
        description:
          'Read performance data and run the workflows your account is allowed to use.',
        icon: '',
        title: 'Analytics and Workflows',
      },
      {
        description:
          'Load only the toolsets an agent needs with ?toolsets=, or every tool with ?profile=full.',
        icon: '',
        title: 'Scoped Toolsets',
      },
      {
        description:
          'Posts wait for your approval before they publish, unless a workflow allows direct publishing.',
        icon: '',
        title: 'Review Gates',
      },
    ],
    headline: 'Connect Any AI Agent to Genfeed',
    icon: '',
    integrations: [
      'Claude',
      'Claude Code',
      'ChatGPT',
      'Codex',
      'Cursor',
      'Gemini',
      'Meta Muse',
      'Grok Bot',
    ],
    name: 'MCP Server',
    pricing: {
      recommended: 'scale',
      why: 'MCP access comes with every plan. Tool calls have no usage cap, only a standard per-minute rate limit; agents spend credits on what they generate.',
    },
    relatedProducts: ['chatgpt', 'hire-agents', 'cursor'],
    seoTitle: 'MCP Server: Connect Any AI Agent to Genfeed',
    slug: 'mcp',
    tagline: 'Your content workspace, connected to your agent',
    targetAudience: [
      'AI engineers building agents',
      'Developers creating automations',
      'Teams using Claude/ChatGPT',
      'Companies building AI workflows',
      'Tech-savvy content creators',
    ],
    useCases: [
      {
        description:
          'Schedule posts from the terminal with Claude Code or Codex',
        example:
          '"Turn this changelog into five X posts and schedule them tomorrow" → Drafts in review → Approved → Scheduled',
        title: 'Coding Agents',
      },
      {
        description: 'Create content from chat in Claude, ChatGPT, or Gemini',
        example:
          '"Make a vertical product video for TikTok" → Generated with brand context → Held for review',
        title: 'Chat Assistants',
      },
      {
        description: 'Let Meta Muse or Grok Bot run recurring content routines',
        example:
          'Weekly routine drafts LinkedIn posts from your blog → You approve → Genfeed publishes',
        title: 'Personal Agents',
      },
    ],
  },
  {
    benefits: [
      {
        problem:
          'Switching between Cursor and Genfeed Studio to generate content',
        solution:
          'Use Genfeed Studio directly in Cursor without leaving your editor',
      },
      {
        problem: 'Breaking your workflow to generate AI content',
        solution:
          'Generate videos, images, and music right from your development environment',
      },
      {
        problem: 'Copy-pasting content between tools',
        solution:
          'Integrate Genfeed content generation into your development workflow',
      },
      {
        problem: 'Missing context when generating content',
        solution:
          'Leverage your codebase context to generate more relevant content',
      },
    ],
    category: 'Developer Tools',
    cta: 'Get Started',
    description:
      'Cursor extension that brings Genfeed Studio directly into your editor. Generate AI videos, images, and music without leaving Cursor.',
    features: [
      {
        description:
          'Access Genfeed Studio directly from within Cursor IDE without switching applications.',
        icon: '',
        title: 'In-Editor Integration',
      },
      {
        description:
          'Generate videos, images, and music using all Genfeed AI models from Cursor.',
        icon: '',
        title: 'Full Studio Features',
      },
      {
        description:
          'Integrate content generation into your development workflow.',
        icon: '',
        title: 'Workflow Integration',
      },
      {
        description:
          'Open-source extension you can customize for your specific needs.',
        icon: '',
        title: 'Open Source',
      },
    ],
    githubUrl:
      'https://github.com/genfeedai/genfeed.ai/tree/master/apps/extensions/ide',
    headline: 'Genfeed Studio in Cursor IDE',
    icon: '',
    integrations: ['Cursor IDE', 'Genfeed Studio'],
    name: 'Cursor Extension',
    pricing: {
      recommended: 'payg',
      why: 'Open-source extension available for free. Requires Genfeed account for AI generation.',
    },
    relatedProducts: ['mcp', 'extension', 'docs'],
    seoTitle: 'Cursor Extension: Generate in Your IDE',
    slug: 'cursor',
    status: 'alpha',
    tagline: 'Use Genfeed Studio directly in Cursor',
    targetAudience: [
      'Developers using Cursor IDE',
      'Content creators who code',
      'Technical content teams',
      'Developers building content tools',
      'Anyone who wants AI content generation in their editor',
    ],
    useCases: [
      {
        description: 'Generate content while coding without context switching',
        example:
          'Building a landing page → Generate hero image directly in Cursor → Use in your code',
        title: 'In-Editor Content Generation',
      },
      {
        description:
          'Create assets for your projects without leaving your editor',
        example:
          'Need video for README → Generate in Cursor → Embed directly in docs',
        title: 'Development Assets',
      },
      {
        description:
          'Integrate content generation into your development workflow',
        example:
          'Building a blog → Generate featured images → Create content → All in Cursor',
        title: 'Unified Workflow',
      },
    ],
  },
  {
    benefits: [
      {
        problem: 'Managing approvals and content on mobile devices',
        solution:
          'Mobile app companion to approve, review, and share content from anywhere',
      },
      {
        problem: 'Missed approvals when away from desktop',
        solution:
          'Get notifications and approve content instantly on iOS or Android',
      },
      {
        problem: 'Cannot preview content on mobile',
        solution:
          'View and approve videos, images, and articles directly on your phone',
      },
      {
        problem: 'Limited mobile access to Genfeed features',
        solution:
          'Full mobile app with approvals, notifications, and content preview',
      },
    ],
    category: 'Mobile',
    cta: 'Join Alpha',
    description:
      'Mobile companion app for Genfeed.ai. Approve content, receive notifications, and manage your workspace from iOS or Android devices.',
    features: [
      {
        description:
          'Approve or reject content directly from your mobile device with one tap.',
        icon: '',
        title: 'Content Approvals',
      },
      {
        description:
          'Receive real-time notifications for approvals, publishing, and workspace activity.',
        icon: '',
        title: 'Push Notifications',
      },
      {
        description:
          'Preview videos, images, and articles before approving them for publication.',
        icon: '',
        title: 'Content Preview',
      },
      {
        description:
          'Built with React Native and Expo for iOS and Android. Open source and customizable.',
        icon: '',
        title: 'Cross-Platform',
      },
    ],
    headline: 'Genfeed Mobile Companion',
    icon: '',
    integrations: ['Genfeed API', 'Expo', 'React Native'],
    name: 'Mobile App',
    pricing: {
      recommended: 'payg',
      why: 'Open-source mobile app. Free to use with any Genfeed account.',
    },
    relatedProducts: ['extension', 'docs', 'mcp'],
    seoTitle: 'Mobile App: Approve & Publish On the Go',
    slug: 'mobile',
    status: 'alpha',
    tagline: 'Manage Genfeed from your mobile device',
    targetAudience: [
      'Content creators on the go',
      'Managers who approve content',
      'Teams working remotely',
      'Anyone who needs mobile access',
      'Users who want notifications',
    ],
    useCases: [
      {
        description: 'Approve content approvals while away from your desk',
        example:
          'Receiving approval notification → Review content on phone → Approve instantly',
        title: 'Mobile Approvals',
      },
      {
        description:
          'Stay updated on your content performance and publishing schedule',
        example:
          'Get push notifications → See what published → Check performance → All on mobile',
        title: 'Stay Connected',
      },
      {
        description: 'Quick content previews and sharing from mobile',
        example:
          'Content ready → Preview on phone → Share directly to social media',
        title: 'Quick Actions',
      },
    ],
  },
  {
    benefits: [
      {
        problem: 'Missing documentation for Genfeed features and integrations',
        solution:
          'Comprehensive open-source documentation for all Genfeed products',
      },
      {
        problem: 'Hard to find API examples and integration guides',
        solution: 'Complete API documentation with code examples and tutorials',
      },
      {
        problem: 'Unclear how to customize or extend Genfeed',
        solution:
          'Developer guides, architecture docs, and contribution guidelines',
      },
      {
        problem: 'Outdated or incomplete documentation',
        solution: 'Open-source docs you can contribute to and improve',
      },
    ],
    category: 'Documentation',
    cta: 'View on GitHub',
    description:
      'API references, integration guides, self-hosting instructions, and step-by-step tutorials for every Genfeed product. Open source and community-driven.',
    features: [
      {
        description:
          'Comprehensive guides covering all Genfeed products, features, and integrations.',
        icon: '',
        title: 'Complete Documentation',
      },
      {
        description:
          'API references with code examples, request/response formats, and authentication.',
        icon: '',
        title: 'API Documentation',
      },
      {
        description:
          'Step-by-step tutorials for common workflows and integrations.',
        icon: '',
        title: 'Tutorials & Guides',
      },
      {
        description:
          'Built with Nextra. Open source and open to community contributions.',
        icon: '',
        title: 'Open Source',
      },
    ],
    githubUrl: 'https://github.com/genfeedai/genfeed.ai/tree/master/apps/docs',
    headline: 'Genfeed.ai Documentation',
    icon: '',
    integrations: ['Nextra', 'Next.js'],
    name: 'Documentation',
    pricing: {
      recommended: 'payg',
      why: 'Documentation is free and open source. Community contributions welcome.',
    },
    relatedProducts: ['mcp', 'cursor', 'extension'],
    seoTitle: 'Documentation: Guides & API Reference',
    slug: 'docs',
    tagline: 'Complete documentation for Genfeed.ai',
    targetAudience: [
      'Developers integrating Genfeed',
      'Users learning the platform',
      'Contributors to open-source projects',
      'Technical content creators',
      'Anyone building with Genfeed',
    ],
    useCases: [
      {
        description: 'Find API endpoints, authentication, and code examples',
        example:
          'Need to integrate Genfeed API → Check docs → Copy example code → Implement',
        title: 'API Integration',
      },
      {
        description: 'Learn how to use Genfeed features effectively',
        example:
          'New to platform → Read tutorials → Follow guides → Master features',
        title: 'Learning Resources',
      },
      {
        description: 'Contribute improvements and fixes to documentation',
        example:
          'Found documentation error → Submit PR → Help improve docs for everyone',
        title: 'Community Contribution',
      },
    ],
  },
  {
    benefits: [
      {
        problem: 'Missing Genfeed features when browsing social media',
        solution:
          'Chrome extension brings Genfeed capabilities directly to your browser',
      },
      {
        problem: 'Switching between browser and Genfeed to generate content',
        solution:
          'Generate and publish content directly from any webpage you are viewing',
      },
      {
        problem: 'Cannot quickly save inspiration from social media',
        solution:
          'One-click save of posts, images, and videos to your Genfeed workspace',
      },
      {
        problem: 'Limited integration with browser workflows',
        solution:
          'Full Genfeed Studio and Publishing features accessible as a browser extension',
      },
    ],
    category: 'Browser Extension',
    cta: 'Join Alpha',
    description:
      'Chrome extension for Genfeed.ai. Generate content, publish to social media, and manage your workspace directly from your browser.',
    features: [
      {
        description:
          'Access Genfeed Studio to generate videos, images, and music from any webpage.',
        icon: '',
        title: 'In-Browser Generation',
      },
      {
        description:
          'Publish content directly to social media platforms without leaving your browser.',
        icon: '',
        title: 'Quick Publishing',
      },
      {
        description:
          'Save interesting posts, images, and videos to your Genfeed workspace with one click.',
        icon: '',
        title: 'Inspiration Saving',
      },
      {
        description:
          'Built with Plasmo framework. Open source and available on Chrome Web Store.',
        icon: '',
        title: 'Chrome Extension',
      },
    ],
    headline: 'Genfeed Chrome Extension',
    icon: '',
    integrations: ['Chrome Browser', 'Genfeed API', 'Plasmo Framework'],
    name: 'Chrome Extension',
    pricing: {
      recommended: 'payg',
      why: 'Open-source Chrome extension. Free to install and use with any Genfeed account.',
    },
    relatedProducts: ['mobile', 'cursor', 'docs'],
    slug: 'extension',
    status: 'alpha',
    tagline: 'Genfeed in your browser',
    targetAudience: [
      'Chrome browser users',
      'Content creators browsing social media',
      'Users who want quick access',
      'People who want inspiration saving',
      'Anyone who wants browser integration',
    ],
    useCases: [
      {
        description: 'Generate content inspired by what you see while browsing',
        example:
          'See interesting tweet → Click extension → Generate similar content → Publish',
        title: 'Inspiration to Creation',
      },
      {
        description: 'Save posts and content to your workspace for later',
        example:
          'Find great example → Save to Genfeed → Reference later when creating',
        title: 'Content Saving',
      },
      {
        description: 'Publish content without leaving your current webpage',
        example:
          'Generate content → Publish to multiple platforms → All from extension',
        title: 'Quick Publishing',
      },
    ],
  },
];

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getAllProductSlugs(): string[] {
  return products.map((p) => p.slug);
}

export function getRelatedProducts(currentSlug: string): Product[] {
  const product = getProductBySlug(currentSlug);
  if (!product) {
    return [];
  }

  const relatedProducts: Product[] = [];

  for (const slug of product.relatedProducts) {
    const relatedProduct = getProductBySlug(slug);

    if (relatedProduct) {
      relatedProducts.push(relatedProduct);
    }
  }

  return relatedProducts;
}

export function getOpenSourceProducts(): Product[] {
  return products.filter((p) => p.githubUrl && p.slug !== 'cursor');
}

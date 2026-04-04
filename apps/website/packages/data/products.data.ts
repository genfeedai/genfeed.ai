export interface Product {
  slug: string;
  name: string;
  tagline: string;
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
    recommended: string;
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
        problem: 'Managing 10+ social accounts across different platforms',
        solution:
          'One dashboard to publish everywhere - X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Pinterest, Reddit, Discord, Twitch',
      },
      {
        problem: 'Manually formatting content for each platform',
        solution:
          'Auto-optimization with platform-specific captions, hashtags, and formats',
      },
      {
        problem: 'Forgetting to post consistently',
        solution:
          'Schedule weeks of content in advance. AI picks best posting times.',
      },
      {
        problem: 'Spending hours on content distribution',
        solution: 'Batch upload and schedule 30 days of content in 20 minutes',
      },
    ],
    category: 'Content Distribution',
    cta: 'Start Publishing Everywhere',
    description:
      'Schedule and publish content across 10+ major social platforms from one dashboard. Built for AI-powered content creators.',
    features: [
      {
        description:
          'Post to X/Twitter, LinkedIn, Instagram, TikTok, YouTube, Facebook, Pinterest, Reddit, Discord, and Twitch from a single composer.',
        icon: '',
        title: '10+ Platform Publishing',
      },
      {
        description:
          'Schedule weeks of content in advance. AI recommends best posting times.',
        icon: '',
        title: 'Smart Scheduling',
      },
      {
        description:
          'Auto-format content for each platform with platform-specific captions and hashtags.',
        icon: '',
        title: 'Platform Optimization',
      },
      {
        description:
          'Upload and schedule multiple pieces of content at once to save time.',
        icon: '',
        title: 'Batch Publishing',
      },
    ],
    headline: 'Publish to 10+ Social Platforms',
    icon: '',
    integrations: [
      'X/Twitter',
      'LinkedIn',
      'Instagram',
      'TikTok',
      'YouTube',
      'Facebook',
      'Pinterest',
      'Reddit',
      'Discord',
      'Twitch',
    ],
    name: 'Publisher',
    pricing: {
      recommended: 'Scale',
      why: 'Includes unlimited scheduling, multi-platform publishing, and team collaboration for agencies and brands.',
    },
    relatedProducts: ['studio', 'workflows', 'agents'],
    slug: 'publisher',
    tagline: 'Publish your content, everywhere, instantly',
    targetAudience: [
      'Content creators posting daily',
      'Marketing teams running campaigns',
      'Social media managers',
      'Agencies managing multiple clients',
      'Brands with multi-platform presence',
    ],
    useCases: [
      {
        description: 'Post daily across all platforms without the manual work',
        example:
          'Generate 30 videos in Studio → Schedule all to publish across platforms',
        title: 'Content Creators',
      },
      {
        description: 'Manage multiple client accounts from one dashboard',
        example:
          'Handle 10 client brands with different posting schedules and platform strategies',
        title: 'Agencies',
      },
      {
        description: 'Run multi-channel campaigns with coordinated publishing',
        example:
          'Launch product announcement simultaneously on all platforms with platform-specific messaging',
        title: 'Marketers',
      },
    ],
  },
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
              'Schedule recurring workflow runs so generation, review, and publishing happen autonomously.',
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
    name: 'Agents',
    pricing: {
      recommended: 'Scale',
      why: 'Includes the full agent library, autonomous scheduled execution, and the workflow capacity needed to run deterministic agentic systems in production.',
    },
    relatedProducts: ['workflows', 'publisher', 'studio'],
    slug: 'agents',
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
      recommended: 'Scale',
      why: 'Includes ChatGPT integration, unlimited commands, and advanced workflow automation.',
    },
    relatedProducts: ['mcp', 'studio', 'publisher'],
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
          '"Create 5 TikTok videos about AI trends and schedule for this week" → Done',
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
          'Brainstorming in ChatGPT → "Post this as tweet" → Published instantly',
        title: 'Hands-Free Management',
      },
    ],
  },
  {
    benefits: [
      {
        problem: 'AI agents cannot access your Genfeed data',
        solution:
          'MCP server gives any compatible AI full read/write access to your workspace',
      },
      {
        problem: 'Building custom integrations takes weeks',
        solution:
          'MCP protocol is standard. Works with Claude, ChatGPT, and more.',
      },
      {
        problem: 'Manual data sharing between AI tools',
        solution: 'AI agents automatically sync with Genfeed via MCP protocol',
      },
      {
        problem: 'Limited AI automation capabilities',
        solution:
          'AI agents can execute complex Genfeed workflows programmatically',
      },
    ],
    category: 'Developer Tools',
    cta: 'Enable MCP Server',
    description:
      'Integrate Genfeed with AI agents using the Model Context Protocol (MCP). Let any MCP-compatible AI access your content, analytics, and workflows.',
    features: [
      {
        description: 'MCP server exposing Genfeed capabilities to AI agents.',
        icon: '',
        title: 'MCP Server',
      },
      {
        description:
          'AI agents can read, create, and manage your Genfeed content.',
        icon: '',
        title: 'Content Access',
      },
      {
        description:
          'Give AI agents access to performance data and trend insights.',
        icon: '',
        title: 'Analytics Access',
      },
      {
        description: 'AI agents can trigger Genfeed workflows and automation.',
        icon: '',
        title: 'Workflow Execution',
      },
    ],
    headline: 'Connect AI Agents to Genfeed',
    icon: '',
    integrations: [
      'Anthropic Claude',
      'OpenAI',
      'MCP Protocol',
      'Custom AI Agents',
    ],
    name: 'MCP Server',
    pricing: {
      recommended: 'Scale',
      why: 'Includes MCP server access, unlimited API calls, and priority support for developers.',
    },
    relatedProducts: ['chatgpt', 'agents', 'studio'],
    slug: 'mcp',
    status: 'alpha',
    tagline: 'AI Model Context Protocol integration',
    targetAudience: [
      'AI engineers building agents',
      'Developers creating automations',
      'Teams using Claude/ChatGPT',
      'Companies building AI workflows',
      'Tech-savvy content creators',
    ],
    useCases: [
      {
        description: 'Use Claude to manage Genfeed content',
        example:
          'Claude accesses your analytics → Suggests content improvements → Creates optimized content',
        title: 'Claude Desktop Integration',
      },
      {
        description: 'Build AI agents that work with Genfeed',
        example:
          'Custom agent monitors trends → Generates content → Publishes to Genfeed automatically',
        title: 'Custom AI Workflows',
      },
      {
        description: 'Connect multiple AIs to your Genfeed workspace',
        example:
          'Research agent finds trends → Writer agent creates content → Publisher agent schedules posts',
        title: 'Multi-Agent Systems',
      },
    ],
  },
  {
    benefits: [
      {
        problem: 'Spending 10+ hours editing videos weekly',
        solution: 'Generate production-ready videos in 2 minutes with AI',
      },
      {
        problem: 'Expensive subscriptions to multiple AI tools',
        solution:
          'All AI models in one platform - save $500+/month on subscriptions',
      },
      {
        problem: 'Learning curve for each AI tool',
        solution:
          'One interface for all content types - videos, images, voices, articles',
      },
      {
        problem: 'Cannot create visual content without design skills',
        solution: 'AI does the heavy lifting - just describe what you want',
      },
    ],
    category: 'Content Creation',
    cta: 'Start Creating',
    description:
      'Generate videos, images, and music with 7+ cutting-edge AI models including Google Veo 3, Imagen 4, and OpenAI Sora 2. The complete content creation workspace for AI-powered creators.',
    features: [
      {
        description:
          'Create videos in 2 minutes with Google Veo 3, OpenAI Sora 2, and GPT-powered models.',
        icon: '',
        title: 'AI Video Generation',
      },
      {
        description:
          'Generate images with Google Imagen 4, DALL-E, and GPT Image models.',
        icon: '',
        title: 'AI Image Generation',
      },
      {
        description:
          'AI voice cloning with ElevenLabs and music generation. Avatars and articles coming soon.',
        icon: '',
        title: 'Voice & Music (Coming Soon)',
      },
      {
        description:
          '7+ AI models available - choose the best one for each project.',
        icon: '',
        title: 'Multi-Model Support',
      },
    ],
    headline: 'Create AI Content in Minutes, Not Hours',
    icon: '',
    integrations: [
      'Google Veo 3 (Video)',
      'Google Imagen 4 (Images)',
      'OpenAI Sora 2 (Video)',
      'OpenAI DALL-E (Images)',
      'OpenAI GPT (Images)',
      'ElevenLabs (Voice - Coming Soon)',
      'Replicate (Multiple Models)',
    ],
    name: 'Studio',
    pricing: {
      recommended: 'Pro',
      why: '$499/month includes 30 AI videos + 500 images. Perfect for creators posting daily.',
    },
    relatedProducts: ['publisher', 'workflows', 'intelligence'],
    slug: 'studio',
    tagline: 'AI content creation workspace',
    targetAudience: [
      'Content creators posting daily',
      'YouTubers needing B-roll',
      'Social media managers',
      'Marketers creating ads',
      'Agencies producing client content',
    ],
    useCases: [
      {
        description: 'Generate social media videos at scale',
        example:
          'Write prompt → AI generates video in 2 minutes → Edit if needed → Publish',
        title: 'Video Content Creation',
      },
      {
        description: 'Create thumbnails, graphics, and images',
        example:
          'Need thumbnail for YouTube → Generate 10 options → Pick best one → Done',
        title: 'Visual Content',
      },
      {
        description: 'Clone your voice or generate narration',
        example:
          'Upload 30 seconds of voice → AI clones it → Generate unlimited narration',
        title: 'Voice & Audio',
      },
    ],
  },
  {
    benefits: [
      {
        problem:
          'Autonomous systems are hard to trust when execution is hidden',
        solution:
          'Every workflow step, trigger, handoff, and output is explicit, inspectable, and deterministic',
      },
      {
        problem:
          'Natural-language control alone is not enough for advanced operations',
        solution:
          'Users can define triggers and author exact workflow steps while agents still trigger execution when appropriate',
      },
      {
        problem: 'Agents need a reliable execution layer for production work',
        solution:
          'Workflows provide deterministic execution for scheduled runs, content generation, ratings, approvals, and publishing',
      },
      {
        problem:
          'Scaling operations fails when retries, conditions, and quality gates are ad hoc',
        solution:
          'Model every trigger, branch, and quality gate directly in the workflow so execution stays controlled at scale',
      },
    ],
    category: 'Automation',
    cta: 'Start Automating',
    description:
      'Build deterministic workflows for content, publishing, and autonomous agent execution. Define triggers, author exact steps, inspect outputs, and let agents call the workflow when needed.',
    features: [
      {
        description:
          'Author every step explicitly, from generation to review to publishing, with deterministic execution across the full pipeline.',
        icon: '',
        title: 'Step-by-Step Control',
      },
      {
        description:
          'Inspect nodes, outputs, and handoffs on a visual canvas so execution stays auditable and predictable.',
        icon: '',
        title: 'Inspectable Canvas',
      },
      {
        description:
          'Agents can trigger workflows automatically, but users still control the triggers, conditions, steps, and quality gates.',
        icon: '',
        title: 'Agent-Triggered, User-Controlled',
      },
      {
        description:
          'Use manual starts, schedules, or event triggers to run deterministic automations when and how you choose.',
        icon: '',
        title: 'Deterministic Triggers',
      },
    ],
    headline: 'Deterministic Workflow Control for Agentic Execution',
    icon: '',
    integrations: [
      'Brand Management',
      'Persona Engine',
      'Asset Library',
      'Content Planner',
      'Photo Sessions',
      'Video Pipeline',
      'Multi-Platform Publish',
    ],
    name: 'Workflows',
    pricing: {
      recommended: 'Scale',
      why: 'Includes the workflow capacity, trigger volume, and execution controls needed to run deterministic agent-driven systems in production.',
    },
    relatedProducts: ['agents', 'studio', 'publisher'],
    slug: 'workflows',
    tagline: 'Deterministic workflows for controllable AI execution',
    targetAudience: [
      'Content teams automating pipelines',
      'Agencies scaling production',
      'Brands enforcing content guidelines',
      'Marketers building repeatable campaigns',
      'Creators automating multi-platform publishing',
    ],
    useCases: [
      {
        description:
          'Define the exact sequence from idea to published content with inspectable execution at every handoff',
        example:
          'Text prompt → generation steps → rating step → approval gate → multi-platform publish',
        title: 'Deterministic Content Pipelines',
      },
      {
        description:
          'Let agents trigger execution while keeping the actual logic explicit and user-controlled',
        example:
          'Agent receives request → triggers workflow → workflow formats outputs, schedules delivery, and reports status',
        title: 'Agent-Orchestrated Execution',
      },
      {
        description:
          'Use schedules and event triggers to run autonomous systems without giving up deterministic control',
        example:
          'Nightly cron → content workflow runs → outputs are rated → approved assets move to publishing automatically',
        title: 'Scheduled Autonomous Runs',
      },
    ],
  },
  {
    benefits: [
      {
        problem: 'No clear visibility into content performance',
        solution:
          'Unified analytics dashboard showing engagement, views, and performance across all platforms',
      },
      {
        problem: "Missing trending topics until they're oversaturated",
        solution:
          'Monitor trending topics across major platforms to create timely content',
      },
      {
        problem: 'Unsure which content formats work best',
        solution:
          'Performance insights show which formats and topics resonate with your audience',
      },
      {
        problem: 'Manually checking multiple platform analytics',
        solution:
          'One dashboard with aggregated metrics from all your social accounts',
      },
    ],
    category: 'Analytics',
    cta: 'Get Intelligence',
    description:
      'Track social media trends, analyze what performs best, and monitor your content performance across platforms. Make data-driven decisions about your content strategy.',
    features: [
      {
        description:
          'Discover trending topics across X, TikTok, Instagram, and YouTube.',
        icon: '',
        title: 'Trend Monitoring',
      },
      {
        description:
          'Track engagement metrics, views, and performance across all platforms.',
        icon: '',
        title: 'Performance Analytics',
      },
      {
        description:
          'Analyze which content formats and topics perform best for your audience.',
        icon: '',
        title: 'Content Insights',
      },
      {
        description:
          'Monitor accounts and topics relevant to your niche for inspiration.',
        icon: '',
        title: 'Watchlist',
      },
    ],
    headline: 'Content Analytics & Performance Insights',
    icon: '',
    integrations: [
      'X/Twitter Analytics',
      'TikTok Analytics',
      'Instagram Insights',
      'YouTube Analytics',
      'Google Analytics',
    ],
    name: 'Analytics',
    pricing: {
      recommended: 'Scale',
      why: 'Includes trend monitoring, performance analytics, and insights across all platforms.',
    },
    relatedProducts: ['studio', 'publisher', 'agents'],
    slug: 'intelligence',
    tagline: 'Track trends, analyze performance, optimize content',
    targetAudience: [
      'Marketers tracking ROI',
      'Content creators optimizing strategy',
      'Agencies reporting to clients',
      'Brands measuring campaign performance',
      'Founders tracking growth metrics',
    ],
    useCases: [
      {
        description: 'Create content based on real-time social trends',
        example:
          'Intelligence alerts you to trending topic → Generate content → Post before competitors',
        title: 'Trend-Based Content',
      },
      {
        description: 'Double down on what works, cut what does not work',
        example:
          'Video format A gets 10x engagement → AI recommends creating more → Revenue increases 3x',
        title: 'Performance Optimization',
      },
      {
        description: 'Monitor engagement and optimize strategy',
        example:
          'Track performance trends → Identify top-performing content → Create similar content',
        title: 'Performance Tracking',
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
          'Seamlessly integrate Genfeed content generation into your development workflow',
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
          'Seamlessly integrate content generation into your development workflow.',
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
    githubUrl: 'https://github.com/genfeedai/cursor.genfeed.ai',
    headline: 'Genfeed Studio in Cursor IDE',
    icon: '',
    integrations: ['Cursor IDE', 'Genfeed Studio'],
    name: 'Cursor Extension',
    pricing: {
      recommended: 'Free',
      why: 'Open-source extension available for free. Requires Genfeed account for AI generation.',
    },
    relatedProducts: ['studio', 'extension', 'docs'],
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
      recommended: 'Free',
      why: 'Open-source mobile app. Free to use with any Genfeed account.',
    },
    relatedProducts: ['publisher', 'studio', 'extension'],
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
      'API references, integration guides, and tutorials. Open source and community-driven.',
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
          'Built with Docusaurus. Open source and open to community contributions.',
        icon: '',
        title: 'Open Source',
      },
    ],
    githubUrl: 'https://github.com/genfeedai/docs.genfeed.ai',
    headline: 'Genfeed.ai Documentation',
    icon: '',
    integrations: ['Docusaurus', 'GitHub Pages'],
    name: 'Documentation',
    pricing: {
      recommended: 'Free',
      why: 'Documentation is free and open source. Community contributions welcome.',
    },
    relatedProducts: ['mcp', 'cursor', 'extension'],
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
          'Full Genfeed Studio and Publisher features accessible as a browser extension',
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
      recommended: 'Free',
      why: 'Open-source Chrome extension. Free to install and use with any Genfeed account.',
    },
    relatedProducts: ['studio', 'publisher', 'mobile'],
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

  return product.relatedProducts
    .map((slug) => getProductBySlug(slug))
    .filter((p): p is Product => p !== undefined);
}

export function getOpenSourceProducts(): Product[] {
  return products.filter((p) => p.githubUrl && p.slug !== 'cursor');
}

/**
 * Test Data Fixtures for Playwright E2E Tests
 *
 * Provides consistent test data generators for use across all E2E tests.
 * Uses deterministic data to ensure reproducible test results.
 *
 * @module test-data.fixture
 */

// ----------------------------------------------------------------------------
// Type Definitions
// ----------------------------------------------------------------------------

interface TestUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  imageUrl: string;
}

interface TestOrganization {
  id: string;
  name: string;
  slug: string;
  imageUrl: string;
}

interface TestVideo {
  id: string;
  title: string;
  prompt: string;
  status: string;
  url: string;
  thumbnailUrl: string;
  duration: number;
  width: number;
  height: number;
  format: string;
}

interface TestImage {
  id: string;
  title: string;
  prompt: string;
  status: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  format: string;
}

interface TestMusic {
  id: string;
  title: string;
  prompt: string;
  status: string;
  url: string;
  duration: number;
  genre: string;
}

interface TestPrompt {
  id: string;
  text: string;
  category: string;
  model: string;
}

// ----------------------------------------------------------------------------
// User Data
// ----------------------------------------------------------------------------

export const testUsers: Record<string, TestUser> = {
  admin: {
    email: 'admin@genfeed.ai',
    firstName: 'Admin',
    fullName: 'Admin User',
    id: 'user-admin-001',
    imageUrl: 'https://cdn.genfeed.ai/avatars/admin.png',
    lastName: 'User',
  },
  default: {
    email: 'test@genfeed.ai',
    firstName: 'Test',
    fullName: 'Test User',
    id: 'user-default-001',
    imageUrl: 'https://cdn.genfeed.ai/avatars/default.png',
    lastName: 'User',
  },
  viewer: {
    email: 'viewer@genfeed.ai',
    firstName: 'View',
    fullName: 'View Only',
    id: 'user-viewer-001',
    imageUrl: 'https://cdn.genfeed.ai/avatars/viewer.png',
    lastName: 'Only',
  },
};

export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  const base = testUsers.default;
  const user = { ...base, ...overrides };
  user.fullName = `${user.firstName} ${user.lastName}`;
  return user;
}

// ----------------------------------------------------------------------------
// Organization Data
// ----------------------------------------------------------------------------

export const testOrganizations: Record<string, TestOrganization> = {
  default: {
    id: 'org-default-001',
    imageUrl: 'https://cdn.genfeed.ai/orgs/default.png',
    name: 'Test Organization',
    slug: 'test-org',
  },
  enterprise: {
    id: 'org-enterprise-001',
    imageUrl: 'https://cdn.genfeed.ai/orgs/enterprise.png',
    name: 'Enterprise Corp',
    slug: 'enterprise-corp',
  },
};

export function createTestOrganization(
  overrides: Partial<TestOrganization> = {},
): TestOrganization {
  return { ...testOrganizations.default, ...overrides };
}

// ----------------------------------------------------------------------------
// Video Data
// ----------------------------------------------------------------------------

export const testVideos: TestVideo[] = [
  {
    duration: 30,
    format: 'mp4',
    height: 1080,
    id: 'video-001',
    prompt: 'A professional product demonstration showcasing features',
    status: 'completed',
    thumbnailUrl: 'https://cdn.genfeed.ai/mock/videos/demo-thumb.jpg',
    title: 'Product Demo Video',
    url: 'https://cdn.genfeed.ai/mock/videos/demo.mp4',
    width: 1920,
  },
  {
    duration: 15,
    format: 'mp4',
    height: 1920,
    id: 'video-002',
    prompt: 'Engaging social media advertisement for brand awareness',
    status: 'completed',
    thumbnailUrl: 'https://cdn.genfeed.ai/mock/videos/social-ad-thumb.jpg',
    title: 'Social Media Ad',
    url: 'https://cdn.genfeed.ai/mock/videos/social-ad.mp4',
    width: 1080,
  },
  {
    duration: 0,
    format: 'mp4',
    height: 1080,
    id: 'video-003',
    prompt: 'Step-by-step tutorial explaining the process',
    status: 'processing',
    thumbnailUrl: 'https://cdn.genfeed.ai/mock/videos/tutorial-thumb.jpg',
    title: 'Tutorial Video',
    url: '',
    width: 1920,
  },
];

export function createTestVideo(overrides: Partial<TestVideo> = {}): TestVideo {
  const id = overrides.id || `video-${Date.now()}`;
  return {
    duration: 30,
    format: 'mp4',
    height: 1080,
    id,
    prompt: 'A test video prompt',
    status: 'completed',
    thumbnailUrl: `https://cdn.genfeed.ai/mock/videos/${id}-thumb.jpg`,
    title: 'Test Video',
    url: `https://cdn.genfeed.ai/mock/videos/${id}.mp4`,
    width: 1920,
    ...overrides,
  };
}

export function createTestVideoCollection(count: number): TestVideo[] {
  return Array.from({ length: count }, (_, i) =>
    createTestVideo({
      id: `video-collection-${i}`,
      title: `Collection Video ${i + 1}`,
    }),
  );
}

// ----------------------------------------------------------------------------
// Image Data
// ----------------------------------------------------------------------------

export const testImages: TestImage[] = [
  {
    format: 'png',
    height: 1080,
    id: 'image-001',
    prompt: 'Professional hero banner for website landing page',
    status: 'completed',
    thumbnailUrl: 'https://cdn.genfeed.ai/mock/images/hero-banner-thumb.jpg',
    title: 'Hero Banner',
    url: 'https://cdn.genfeed.ai/mock/images/hero-banner.png',
    width: 1920,
  },
  {
    format: 'png',
    height: 1024,
    id: 'image-002',
    prompt: 'Clean product photography with white background',
    status: 'completed',
    thumbnailUrl: 'https://cdn.genfeed.ai/mock/images/product-shot-thumb.jpg',
    title: 'Product Shot',
    url: 'https://cdn.genfeed.ai/mock/images/product-shot.png',
    width: 1024,
  },
  {
    format: 'png',
    height: 1080,
    id: 'image-003',
    prompt: 'Eye-catching social media post design',
    status: 'completed',
    thumbnailUrl: 'https://cdn.genfeed.ai/mock/images/social-post-thumb.jpg',
    title: 'Social Post',
    url: 'https://cdn.genfeed.ai/mock/images/social-post.png',
    width: 1080,
  },
];

export function createTestImage(overrides: Partial<TestImage> = {}): TestImage {
  const id = overrides.id || `image-${Date.now()}`;
  return {
    format: 'png',
    height: 1024,
    id,
    prompt: 'A test image prompt',
    status: 'completed',
    thumbnailUrl: `https://cdn.genfeed.ai/mock/images/${id}-thumb.jpg`,
    title: 'Test Image',
    url: `https://cdn.genfeed.ai/mock/images/${id}.png`,
    width: 1024,
    ...overrides,
  };
}

export function createTestImageCollection(count: number): TestImage[] {
  return Array.from({ length: count }, (_, i) =>
    createTestImage({
      id: `image-collection-${i}`,
      title: `Collection Image ${i + 1}`,
    }),
  );
}

// ----------------------------------------------------------------------------
// Music Data
// ----------------------------------------------------------------------------

export const testMusic: TestMusic[] = [
  {
    duration: 180,
    genre: 'corporate',
    id: 'music-001',
    prompt: 'Energetic corporate background music',
    status: 'completed',
    title: 'Upbeat Corporate',
    url: 'https://cdn.genfeed.ai/mock/music/upbeat-corporate.mp3',
  },
  {
    duration: 240,
    genre: 'ambient',
    id: 'music-002',
    prompt: 'Relaxing ambient music for meditation',
    status: 'completed',
    title: 'Ambient Chill',
    url: 'https://cdn.genfeed.ai/mock/music/ambient-chill.mp3',
  },
];

export function createTestMusic(overrides: Partial<TestMusic> = {}): TestMusic {
  const id = overrides.id || `music-${Date.now()}`;
  return {
    duration: 120,
    genre: 'electronic',
    id,
    prompt: 'A test music prompt',
    status: 'completed',
    title: 'Test Music',
    url: `https://cdn.genfeed.ai/mock/music/${id}.mp3`,
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// Prompt Data
// ----------------------------------------------------------------------------

export const testPrompts: Record<string, TestPrompt[]> = {
  image: [
    {
      category: 'image',
      id: 'prompt-image-001',
      model: 'flux',
      text: 'Photorealistic product photography on white background',
    },
    {
      category: 'image',
      id: 'prompt-image-002',
      model: 'ideogram',
      text: 'Modern minimalist logo design with geometric shapes',
    },
    {
      category: 'image',
      id: 'prompt-image-003',
      model: 'midjourney',
      text: 'Fantasy landscape with vibrant colors and detailed scenery',
    },
  ],
  music: [
    {
      category: 'music',
      id: 'prompt-music-001',
      model: 'suno',
      text: 'Upbeat electronic music with catchy melody',
    },
    {
      category: 'music',
      id: 'prompt-music-002',
      model: 'udio',
      text: 'Orchestral epic soundtrack for trailer',
    },
  ],
  video: [
    {
      category: 'video',
      id: 'prompt-video-001',
      model: 'minimax',
      text: 'A cinematic drone shot flying over a mountain landscape at sunset',
    },
    {
      category: 'video',
      id: 'prompt-video-002',
      model: 'runway',
      text: 'Professional product showcase with rotating view and studio lighting',
    },
    {
      category: 'video',
      id: 'prompt-video-003',
      model: 'kling',
      text: 'Animated explainer video with smooth transitions',
    },
  ],
};

export function getRandomPrompt(
  category: 'video' | 'image' | 'music',
): TestPrompt {
  const prompts = testPrompts[category];
  return prompts[Math.floor(Math.random() * prompts.length)];
}

// ----------------------------------------------------------------------------
// Form Data
// ----------------------------------------------------------------------------

export const formData = {
  login: {
    invalidEmail: 'not-an-email',
    invalidPassword: '123',
    validEmail: 'test@genfeed.ai',
    validPassword: 'TestPassword123!',
  },
  profile: {
    bio: 'This is a test bio for the user profile.',
    firstName: 'Updated',
    lastName: 'Name',
    website: 'https://example.com',
  },
  settings: {
    language: 'en',
    theme: 'dark',
    timezone: 'America/New_York',
  },
};

// ----------------------------------------------------------------------------
// Subscription/Billing Data
// ----------------------------------------------------------------------------

export const subscriptionPlans = {
  enterprise: {
    credits: 10000,
    features: [
      'Unlimited generation',
      'Custom models',
      'Dedicated support',
      'SLA',
    ],
    id: 'plan-enterprise',
    name: 'Enterprise',
    price: 499,
  },
  free: {
    credits: 50,
    features: ['Basic generation', '720p videos', 'Standard images'],
    id: 'plan-free',
    name: 'Free',
    price: 0,
  },
  pro: {
    credits: 2000,
    features: ['4K generation', 'All models', 'API access', 'Priority support'],
    id: 'plan-pro',
    name: 'Pro',
    price: 99,
  },
  starter: {
    credits: 500,
    features: ['HD generation', '1080p videos', 'Priority queue'],
    id: 'plan-starter',
    name: 'Starter',
    price: 29,
  },
};

// ----------------------------------------------------------------------------
// Workflow Data
// ----------------------------------------------------------------------------

interface TestWorkflow {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'published' | 'archived';
  nodes: TestWorkflowNode[];
  edges: TestWorkflowEdge[];
  createdAt: string;
  updatedAt: string;
}

interface TestWorkflowNode {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface TestWorkflowEdge {
  id: string;
  source: string;
  target: string;
}

interface TestWorkflowExecution {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt: string | null;
  logs: string[];
  results: Record<string, unknown>;
}

interface TestWorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  nodeCount: number;
  thumbnailUrl: string;
}

interface TestNodeType {
  type: string;
  label: string;
  category: string;
  description: string;
  inputs: string[];
  outputs: string[];
}

export const testWorkflows: TestWorkflow[] = [
  {
    createdAt: '2025-01-15T10:00:00Z',
    description: 'Generate and publish social media content',
    edges: [
      { id: 'edge-1', source: 'node-1', target: 'node-2' },
      { id: 'edge-2', source: 'node-2', target: 'node-3' },
    ],
    id: 'workflow-001',
    name: 'Social Media Pipeline',
    nodes: [
      {
        data: { model: 'gpt-4' },
        id: 'node-1',
        label: 'Generate Text',
        position: { x: 100, y: 100 },
        type: 'text-generation',
      },
      {
        data: { model: 'flux' },
        id: 'node-2',
        label: 'Generate Image',
        position: { x: 400, y: 100 },
        type: 'image-generation',
      },
      {
        data: { platform: 'instagram' },
        id: 'node-3',
        label: 'Publish',
        position: { x: 700, y: 100 },
        type: 'publish',
      },
    ],
    status: 'published',
    updatedAt: '2025-01-20T14:30:00Z',
  },
  {
    createdAt: '2025-02-01T09:00:00Z',
    description: 'Create video content from text',
    edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
    id: 'workflow-002',
    name: 'Video Content Creator',
    nodes: [
      {
        data: { model: 'gpt-4' },
        id: 'node-1',
        label: 'Script Writer',
        position: { x: 100, y: 200 },
        type: 'text-generation',
      },
      {
        data: { model: 'minimax' },
        id: 'node-2',
        label: 'Video Generator',
        position: { x: 400, y: 200 },
        type: 'video-generation',
      },
    ],
    status: 'draft',
    updatedAt: '2025-02-05T11:00:00Z',
  },
];

export function createTestWorkflow(
  overrides: Partial<TestWorkflow> = {},
): TestWorkflow {
  return {
    createdAt: new Date().toISOString(),
    description: 'A test workflow',
    edges: [],
    id: `workflow-${Date.now()}`,
    name: 'Test Workflow',
    nodes: [],
    status: 'draft',
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export const testWorkflowExecutions: TestWorkflowExecution[] = [
  {
    completedAt: '2025-01-20T14:35:00Z',
    id: 'exec-001',
    logs: [
      'Starting workflow execution...',
      'Node "Generate Text" completed.',
      'Node "Generate Image" completed.',
      'Node "Publish" completed.',
      'Workflow execution finished successfully.',
    ],
    results: {
      nodesCompleted: 3,
      outputUrl: 'https://cdn.genfeed.ai/mock/output.png',
    },
    startedAt: '2025-01-20T14:30:00Z',
    status: 'completed',
    workflowId: 'workflow-001',
  },
  {
    completedAt: null,
    id: 'exec-002',
    logs: [
      'Starting workflow execution...',
      'Node "Script Writer" in progress...',
    ],
    results: {},
    startedAt: '2025-02-10T10:00:00Z',
    status: 'running',
    workflowId: 'workflow-002',
  },
  {
    completedAt: '2025-02-08T16:05:00Z',
    id: 'exec-003',
    logs: [
      'Starting workflow execution...',
      'Node "Generate Text" completed.',
      'Node "Generate Image" failed: Rate limit exceeded.',
    ],
    results: { error: 'Rate limit exceeded' },
    startedAt: '2025-02-08T16:00:00Z',
    status: 'failed',
    workflowId: 'workflow-001',
  },
];

export function createTestWorkflowExecution(
  overrides: Partial<TestWorkflowExecution> = {},
): TestWorkflowExecution {
  return {
    completedAt: new Date().toISOString(),
    id: `exec-${Date.now()}`,
    logs: ['Execution started.', 'Execution completed.'],
    results: { success: true },
    startedAt: new Date(Date.now() - 60000).toISOString(),
    status: 'completed',
    workflowId: 'workflow-001',
    ...overrides,
  };
}

export const testWorkflowTemplates: TestWorkflowTemplate[] = [
  {
    category: 'social-media',
    description: 'Auto-generate and post content to social media',
    id: 'template-001',
    name: 'Social Media Automation',
    nodeCount: 4,
    thumbnailUrl: 'https://cdn.genfeed.ai/mock/templates/social.png',
  },
  {
    category: 'video',
    description: 'Create videos from blog posts automatically',
    id: 'template-002',
    name: 'Blog to Video',
    nodeCount: 3,
    thumbnailUrl: 'https://cdn.genfeed.ai/mock/templates/blog-video.png',
  },
  {
    category: 'marketing',
    description: 'Generate email campaign content with AI',
    id: 'template-003',
    name: 'Email Campaign Generator',
    nodeCount: 5,
    thumbnailUrl: 'https://cdn.genfeed.ai/mock/templates/email.png',
  },
];

export const testNodeTypes: TestNodeType[] = [
  {
    category: 'AI',
    description: 'Generate text using AI models',
    inputs: ['prompt'],
    label: 'Text Generation',
    outputs: ['text'],
    type: 'text-generation',
  },
  {
    category: 'AI',
    description: 'Generate images using AI models',
    inputs: ['prompt', 'style'],
    label: 'Image Generation',
    outputs: ['image'],
    type: 'image-generation',
  },
  {
    category: 'AI',
    description: 'Generate videos using AI models',
    inputs: ['prompt', 'duration'],
    label: 'Video Generation',
    outputs: ['video'],
    type: 'video-generation',
  },
  {
    category: 'Output',
    description: 'Publish content to platforms',
    inputs: ['content', 'platform'],
    label: 'Publish',
    outputs: ['result'],
    type: 'publish',
  },
  {
    category: 'Logic',
    description: 'Apply conditional logic',
    inputs: ['condition', 'input'],
    label: 'Conditional',
    outputs: ['true', 'false'],
    type: 'conditional',
  },
];

// ----------------------------------------------------------------------------
// Brand Data
// ----------------------------------------------------------------------------

interface TestBrand {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  connectedAccounts: {
    id: string;
    platform: string;
    username: string;
  }[];
}

export const testBrands: TestBrand[] = [
  {
    connectedAccounts: [
      {
        id: 'acc-1',
        platform: 'instagram',
        username: 'techstartup_ig',
      },
      {
        id: 'acc-2',
        platform: 'tiktok',
        username: 'techstartup_tk',
      },
    ],
    description: 'Innovative tech solutions',
    id: 'brand-001',
    imageUrl: 'https://cdn.genfeed.ai/mock/brands/tech.png',
    name: 'TechStartup',
    slug: 'techstartup',
  },
  {
    connectedAccounts: [
      {
        id: 'acc-3',
        platform: 'instagram',
        username: 'fashionco_ig',
      },
    ],
    description: 'Modern fashion brand',
    id: 'brand-002',
    imageUrl: 'https://cdn.genfeed.ai/mock/brands/fashion.png',
    name: 'FashionCo',
    slug: 'fashionco',
  },
];

export function createTestBrand(overrides: Partial<TestBrand> = {}): TestBrand {
  return { ...testBrands[0], ...overrides };
}

// ----------------------------------------------------------------------------
// Analytics Data
// ----------------------------------------------------------------------------

interface TestAnalyticsMetrics {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  engagementRate: number;
  followersGained: number;
}

export const testAnalyticsMetrics: TestAnalyticsMetrics = {
  engagementRate: 4.8,
  followersGained: 1250,
  totalComments: 3420,
  totalLikes: 15680,
  totalShares: 2100,
  totalViews: 125000,
};

// ----------------------------------------------------------------------------
// Automation Data
// ----------------------------------------------------------------------------

interface TestBot {
  id: string;
  name: string;
  platform: string;
  status: string;
}

export const testBots: TestBot[] = [
  {
    id: 'bot-001',
    name: 'Content Bot',
    platform: 'instagram',
    status: 'active',
  },
  {
    id: 'bot-002',
    name: 'Engagement Bot',
    platform: 'tiktok',
    status: 'paused',
  },
];

interface TestCampaign {
  id: string;
  name: string;
  status: string;
  postsCount: number;
}

export const testCampaigns: TestCampaign[] = [
  {
    id: 'campaign-001',
    name: 'Summer Campaign',
    postsCount: 24,
    status: 'active',
  },
  {
    id: 'campaign-002',
    name: 'Product Launch',
    postsCount: 12,
    status: 'completed',
  },
];

// ----------------------------------------------------------------------------
// Post Data
// ----------------------------------------------------------------------------

interface TestPost {
  id: string;
  label: string;
  description: string;
  platform: string;
  status: string;
  scheduledDate: string | null;
  category: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
}

export const testPosts: TestPost[] = [
  {
    category: 'text',
    description: 'Excited to share our latest product update! 🚀',
    id: 'post-001',
    label: 'Product Update Tweet',
    platform: 'twitter',
    scheduledDate: null,
    status: 'DRAFT',
    totalComments: 0,
    totalLikes: 0,
    totalViews: 0,
  },
  {
    category: 'text',
    description: 'Check out our behind-the-scenes content.',
    id: 'post-002',
    label: 'BTS Instagram Post',
    platform: 'instagram',
    scheduledDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'SCHEDULED',
    totalComments: 0,
    totalLikes: 0,
    totalViews: 0,
  },
  {
    category: 'video',
    description: 'Full product walkthrough and demo video.',
    id: 'post-003',
    label: 'Demo Video Post',
    platform: 'youtube',
    scheduledDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'PUBLIC',
    totalComments: 23,
    totalLikes: 89,
    totalViews: 1200,
  },
  {
    category: 'text',
    description: 'Industry insights and professional thoughts.',
    id: 'post-004',
    label: 'LinkedIn Thought Leadership',
    platform: 'linkedin',
    scheduledDate: new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    status: 'SCHEDULED',
    totalComments: 0,
    totalLikes: 0,
    totalViews: 0,
  },
  {
    category: 'text',
    description: 'Quick tip for our followers.',
    id: 'post-005',
    label: 'Quick Tip Draft',
    platform: 'twitter',
    scheduledDate: null,
    status: 'DRAFT',
    totalComments: 0,
    totalLikes: 0,
    totalViews: 0,
  },
];

export function createTestPost(overrides: Partial<TestPost> = {}): TestPost {
  const base = testPosts[0];
  return { ...base, ...overrides };
}

export function getTestPostsByStatus(status: string): TestPost[] {
  return testPosts.filter((p) => p.status === status);
}

// Post publishing platforms for testing
export const testPlatforms = [
  { id: 'twitter', label: 'Twitter / X', name: 'twitter' },
  {
    id: 'instagram',
    label: 'Instagram',
    name: 'instagram',
  },
  { id: 'youtube', label: 'YouTube', name: 'youtube' },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    name: 'linkedin',
  },
  { id: 'tiktok', label: 'TikTok', name: 'tiktok' },
];

// ----------------------------------------------------------------------------
// Date/Time Helpers
// ----------------------------------------------------------------------------

export function getDateRange(days: number): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { end, start };
}

export function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ----------------------------------------------------------------------------
// URL/Path Helpers
// ----------------------------------------------------------------------------

export const testRoutes = {
  activities: '/activities',
  billing: '/billing',
  calendar: {
    articles: '/calendar/articles',
    posts: '/calendar/posts',
  },
  editor: '/editor',
  generation: {
    avatar: '/g/avatar',
    image: '/g/image',
    music: '/g/music',
    video: '/g/video',
  },
  home: '/',
  login: '/login',
  logout: '/logout',
  overview: '/overview',
  posts: {
    detail: (id: string) => `/posts/${id}`,
    drafts: '/posts/drafts',
    engage: '/posts/engage',
    published: '/posts/published',
    scheduled: '/posts/scheduled',
  },
  settings: '/settings',
  studio: '/studio',
  workflow: {
    editor: '/workflows/new',
    executions: '/workflows/executions',
    library: '/workflows',
    templates: '/workflows/templates',
  },
};

// ----------------------------------------------------------------------------
// Selectors
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Marketplace Data
// ----------------------------------------------------------------------------

export interface TestListing {
  id: string;
  title: string;
  slug: string;
  sellerSlug: string;
  sellerName: string;
  type: string;
  price: number;
  isFree: boolean;
  description: string;
  rating: number;
  reviewCount: number;
}

export const testListings: TestListing[] = [
  {
    description: 'AI-powered video editing workflow',
    id: 'listing-001',
    isFree: false,
    price: 999,
    rating: 4.8,
    reviewCount: 42,
    sellerName: 'Pro Creator',
    sellerSlug: 'pro-creator',
    slug: 'video-editing-workflow',
    title: 'Video Editing Workflow',
    type: 'workflow',
  },
  {
    description: 'Professional prompt templates pack',
    id: 'listing-002',
    isFree: false,
    price: 499,
    rating: 4.5,
    reviewCount: 28,
    sellerName: 'Prompt Master',
    sellerSlug: 'prompt-master',
    slug: 'pro-prompt-pack',
    title: 'Pro Prompt Pack',
    type: 'prompt',
  },
  {
    description: 'Free starter preset for beginners',
    id: 'listing-003',
    isFree: true,
    price: 0,
    rating: 4.2,
    reviewCount: 156,
    sellerName: 'GenFeed Team',
    sellerSlug: 'genfeed',
    slug: 'starter-preset',
    title: 'Free Starter Preset',
    type: 'preset',
  },
];

export function createTestListing(
  overrides: Partial<TestListing> = {},
): TestListing {
  return { ...testListings[0], ...overrides };
}

export interface TestPurchase {
  id: string;
  listingId: string;
  listingTitle: string;
  listingType: string;
  listingSlug: string;
  sellerSlug: string;
  status: string;
  createdAt: string;
}

export const testPurchases: TestPurchase[] = [
  {
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    id: 'purchase-001',
    listingId: 'listing-001',
    listingSlug: 'video-editing-workflow',
    listingTitle: 'Video Editing Workflow',
    listingType: 'workflow',
    sellerSlug: 'pro-creator',
    status: 'completed',
  },
  {
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    id: 'purchase-002',
    listingId: 'listing-002',
    listingSlug: 'pro-prompt-pack',
    listingTitle: 'Pro Prompt Pack',
    listingType: 'prompt',
    sellerSlug: 'prompt-master',
    status: 'completed',
  },
];

// ----------------------------------------------------------------------------
// Admin Test Data
// ----------------------------------------------------------------------------

export const testAdminStats = {
  activeSubscriptions: 284,
  generationsToday: 1543,
  mrr: 42500,
  newUsersToday: 37,
  totalOrganizations: 156,
  totalTemplates: 89,
  totalUsers: 2847,
};

export const testAdminRoutes = {
  analyticsAll: '/analytics/all',
  analyticsBrands: '/analytics/brands',
  analyticsOrganizations: '/analytics/organizations',
  crmAnalytics: '/crm/analytics',
  crmCompanies: '/crm/companies',
  crmLeads: '/crm/leads',
  crmTasks: '/crm/tasks',
  darkroomCharacters: '/darkroom/characters',
  darkroomGallery: '/darkroom/gallery',
  darkroomPipeline: '/darkroom/pipeline',
  overview: '/overview',
  templates: '/templates',
  users: '/users',
};

// ----------------------------------------------------------------------------
// Selectors
// ----------------------------------------------------------------------------

export const selectors = {
  contentGrid: '[data-testid="content-grid"]',
  generateButton: '[data-testid="generate-button"]',
  imageCard: '[data-testid="image-card"]',

  // Loading
  loadingSpinner: '[data-testid="loading"]',

  // Modals
  modal: '[role="dialog"]',
  modalClose: '[aria-label="Close"]',

  // Forms
  promptInput: '[data-testid="prompt-input"]',
  // Navigation
  sidebar: '[data-testid="sidebar"]',
  skeleton: '[data-testid="skeleton"]',
  submitButton: 'button[type="submit"]',

  // Toasts
  toast: '[data-testid="toast"]',
  toastError: '[data-testid="toast-error"]',
  toastSuccess: '[data-testid="toast-success"]',
  topbar: '[data-testid="topbar"]',
  userMenu: '[data-testid="user-menu"]',

  // Content
  videoCard: '[data-testid="video-card"]',
};

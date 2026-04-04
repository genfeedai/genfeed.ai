/**
 * Seed Script: Demo Organization
 *
 * Creates a complete demo org with brands, content, workflows,
 * trainings, and analytics data for the GenFeed demo experience.
 * Uses upsert logic — safe to run multiple times (idempotent).
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/demo.seed.ts
 *   bun run apps/server/api/scripts/seeds/demo.seed.ts --dry-run
 */

import { runScript } from '@api-scripts/db/connection';
import { parseArgs, seedDocuments } from '@api-scripts/db/seed-utils';
import { Logger } from '@nestjs/common';
import { ObjectId } from 'mongodb';

const logger = new Logger('DemoSeed');

// ============================================================================
// STABLE IDS — deterministic ObjectIds for cross-reference integrity
// ============================================================================

const DEMO_USER_ID = new ObjectId('660000000000000000000001');
const DEMO_ORG_ID = new ObjectId('660000000000000000000010');
const DEMO_BRAND_LIFESTYLE_ID = new ObjectId('660000000000000000000020');
const DEMO_BRAND_TECH_ID = new ObjectId('660000000000000000000021');
const DEMO_BRAND_FOOD_ID = new ObjectId('660000000000000000000022');

const DEMO_TRAINING_IDS = {
  brandPortrait: new ObjectId('660000000000000000000032'),
  productShots: new ObjectId('660000000000000000000030'),
  styleTransfer: new ObjectId('660000000000000000000031'),
};

const DEMO_WORKFLOW_IDS = {
  blogToVideo: new ObjectId('660000000000000000000041'),
  socialPipeline: new ObjectId('660000000000000000000040'),
  thumbnailGen: new ObjectId('660000000000000000000042'),
};

const DEMO_INGREDIENT_IDS = {
  foodShot: new ObjectId('660000000000000000000054'),
  heroImage: new ObjectId('660000000000000000000050'),
  lifestylePhoto: new ObjectId('660000000000000000000052'),
  productVideo: new ObjectId('660000000000000000000051'),
  promoClip: new ObjectId('660000000000000000000055'),
  techBanner: new ObjectId('660000000000000000000053'),
};

const DEMO_ARTICLE_IDS = {
  aiContentStrategy: new ObjectId('660000000000000000000060'),
  socialMediaTips: new ObjectId('660000000000000000000062'),
  videoMarketingGuide: new ObjectId('660000000000000000000061'),
};

const DEMO_METADATA_IDS = {
  foodShot: new ObjectId('660000000000000000000074'),
  heroImage: new ObjectId('660000000000000000000070'),
  lifestylePhoto: new ObjectId('660000000000000000000072'),
  productVideo: new ObjectId('660000000000000000000071'),
  promoClip: new ObjectId('660000000000000000000075'),
  techBanner: new ObjectId('660000000000000000000073'),
};

// ============================================================================
// ORGANIZATION
// ============================================================================

const ORGS_COLLECTION = 'organizations';
const ORG_FIELDS_TO_CHECK = [
  'label',
  'category',
  'isSelected',
  'isDeleted',
  'onboardingCompleted',
];

interface OrgDocument {
  _id: ObjectId;
  user: ObjectId;
  label: string;
  category: string;
  isSelected: boolean;
  isDeleted: boolean;
  onboardingCompleted: boolean;
}

const organizations: OrgDocument[] = [
  {
    _id: DEMO_ORG_ID,
    category: 'business',
    isDeleted: false,
    isSelected: true,
    label: 'GenFeed Demo',
    onboardingCompleted: true,
    user: DEMO_USER_ID,
  },
];

// ============================================================================
// BRANDS
// ============================================================================

const BRANDS_COLLECTION = 'brands';
const BRAND_FIELDS_TO_CHECK = [
  'label',
  'handle',
  'description',
  'fontFamily',
  'primaryColor',
  'secondaryColor',
  'backgroundColor',
  'isSelected',
  'isActive',
  'isDeleted',
  'scope',
];

interface BrandDocument {
  _id: ObjectId;
  user: ObjectId;
  organization: ObjectId;
  handle: string;
  label: string;
  description: string;
  fontFamily: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  referenceImages: unknown[];
  isSelected: boolean;
  isActive: boolean;
  isDeleted: boolean;
  scope: string;
}

const brands: BrandDocument[] = [
  {
    _id: DEMO_BRAND_LIFESTYLE_ID,
    backgroundColor: '#0A0A0A',
    description:
      'Lifestyle brand focused on modern living, fashion, and wellness content.',
    fontFamily: 'montserrat-black',
    handle: 'demo-vivid-lifestyle',
    isActive: true,
    isDeleted: false,
    isSelected: true,
    label: 'Vivid Lifestyle',
    organization: DEMO_ORG_ID,
    primaryColor: '#E91E63',
    referenceImages: [],
    scope: 'organization',
    secondaryColor: '#FFFFFF',
    user: DEMO_USER_ID,
  },
  {
    _id: DEMO_BRAND_TECH_ID,
    backgroundColor: '#111827',
    description:
      'Technology brand covering AI tools, SaaS products, and developer content.',
    fontFamily: 'montserrat-black',
    handle: 'demo-nexus-tech',
    isActive: true,
    isDeleted: false,
    isSelected: false,
    label: 'Nexus Tech',
    organization: DEMO_ORG_ID,
    primaryColor: '#3B82F6',
    referenceImages: [],
    scope: 'organization',
    secondaryColor: '#F1F5F9',
    user: DEMO_USER_ID,
  },
  {
    _id: DEMO_BRAND_FOOD_ID,
    backgroundColor: '#FFF7ED',
    description:
      'Food & beverage brand showcasing recipes, restaurant reviews, and culinary arts.',
    fontFamily: 'montserrat-black',
    handle: 'demo-spice-kitchen',
    isActive: true,
    isDeleted: false,
    isSelected: false,
    label: 'Spice Kitchen',
    organization: DEMO_ORG_ID,
    primaryColor: '#F97316',
    referenceImages: [],
    scope: 'organization',
    secondaryColor: '#1C1917',
    user: DEMO_USER_ID,
  },
];

// ============================================================================
// METADATA (required by ingredients)
// ============================================================================

const METADATA_COLLECTION = 'metadata';
const METADATA_FIELDS_TO_CHECK = [
  'width',
  'height',
  'duration',
  'url',
  'thumbnailUrl',
  'mimeType',
  'format',
];

interface MetadataDocument {
  _id: ObjectId;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  duration?: number;
  mimeType: string;
  format: string;
  user: ObjectId;
  organization: ObjectId;
  isDeleted: boolean;
}

const metadata: MetadataDocument[] = [
  {
    _id: DEMO_METADATA_IDS.heroImage,
    format: 'landscape',
    height: 1080,
    isDeleted: false,
    mimeType: 'image/jpeg',
    organization: DEMO_ORG_ID,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&h=225&fit=crop',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1920&h=1080&fit=crop',
    user: DEMO_USER_ID,
    width: 1920,
  },
  {
    _id: DEMO_METADATA_IDS.productVideo,
    duration: 15,
    format: 'portrait',
    height: 1920,
    isDeleted: false,
    mimeType: 'video/mp4',
    organization: DEMO_ORG_ID,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=711&fit=crop',
    url: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=1080&h=1920&fit=crop',
    user: DEMO_USER_ID,
    width: 1080,
  },
  {
    _id: DEMO_METADATA_IDS.lifestylePhoto,
    format: 'square',
    height: 1080,
    isDeleted: false,
    mimeType: 'image/jpeg',
    organization: DEMO_ORG_ID,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop',
    url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=1080&h=1080&fit=crop',
    user: DEMO_USER_ID,
    width: 1080,
  },
  {
    _id: DEMO_METADATA_IDS.techBanner,
    format: 'landscape',
    height: 630,
    isDeleted: false,
    mimeType: 'image/jpeg',
    organization: DEMO_ORG_ID,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400&h=210&fit=crop',
    url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&h=630&fit=crop',
    user: DEMO_USER_ID,
    width: 1200,
  },
  {
    _id: DEMO_METADATA_IDS.foodShot,
    format: 'square',
    height: 1080,
    isDeleted: false,
    mimeType: 'image/jpeg',
    organization: DEMO_ORG_ID,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=400&fit=crop',
    url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1080&h=1080&fit=crop',
    user: DEMO_USER_ID,
    width: 1080,
  },
  {
    _id: DEMO_METADATA_IDS.promoClip,
    duration: 30,
    format: 'landscape',
    height: 1080,
    isDeleted: false,
    mimeType: 'video/mp4',
    organization: DEMO_ORG_ID,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=400&h=225&fit=crop',
    url: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1920&h=1080&fit=crop',
    user: DEMO_USER_ID,
    width: 1920,
  },
];

// ============================================================================
// INGREDIENTS (content items — images, videos)
// ============================================================================

const INGREDIENTS_COLLECTION = 'ingredients';
const INGREDIENT_FIELDS_TO_CHECK = [
  'category',
  'status',
  'order',
  'version',
  'isHighlighted',
  'isDeleted',
  'isFavorite',
  'isPublic',
  'scope',
];

interface IngredientDocument {
  _id: ObjectId;
  user: ObjectId;
  organization: ObjectId;
  brand: ObjectId;
  metadata: ObjectId;
  category: string;
  status: string;
  transformations: string[];
  order: number;
  version: number;
  isHighlighted: boolean;
  isDefault: boolean;
  scope: string;
  isDeleted: boolean;
  isFavorite: boolean;
  isPublic: boolean;
  tags: ObjectId[];
}

const ingredients: IngredientDocument[] = [
  {
    _id: DEMO_INGREDIENT_IDS.heroImage,
    brand: DEMO_BRAND_LIFESTYLE_ID,
    category: 'image',
    isDefault: false,
    isDeleted: false,
    isFavorite: true,
    isHighlighted: true,
    isPublic: false,
    metadata: DEMO_METADATA_IDS.heroImage,
    order: 0,
    organization: DEMO_ORG_ID,
    scope: 'organization',
    status: 'generated',
    tags: [],
    transformations: [],
    user: DEMO_USER_ID,
    version: 1,
  },
  {
    _id: DEMO_INGREDIENT_IDS.productVideo,
    brand: DEMO_BRAND_LIFESTYLE_ID,
    category: 'video',
    isDefault: false,
    isDeleted: false,
    isFavorite: false,
    isHighlighted: false,
    isPublic: false,
    metadata: DEMO_METADATA_IDS.productVideo,
    order: 1,
    organization: DEMO_ORG_ID,
    scope: 'organization',
    status: 'generated',
    tags: [],
    transformations: [],
    user: DEMO_USER_ID,
    version: 1,
  },
  {
    _id: DEMO_INGREDIENT_IDS.lifestylePhoto,
    brand: DEMO_BRAND_LIFESTYLE_ID,
    category: 'image',
    isDefault: false,
    isDeleted: false,
    isFavorite: true,
    isHighlighted: false,
    isPublic: true,
    metadata: DEMO_METADATA_IDS.lifestylePhoto,
    order: 2,
    organization: DEMO_ORG_ID,
    scope: 'organization',
    status: 'generated',
    tags: [],
    transformations: [],
    user: DEMO_USER_ID,
    version: 1,
  },
  {
    _id: DEMO_INGREDIENT_IDS.techBanner,
    brand: DEMO_BRAND_TECH_ID,
    category: 'image',
    isDefault: false,
    isDeleted: false,
    isFavorite: false,
    isHighlighted: true,
    isPublic: false,
    metadata: DEMO_METADATA_IDS.techBanner,
    order: 0,
    organization: DEMO_ORG_ID,
    scope: 'organization',
    status: 'generated',
    tags: [],
    transformations: [],
    user: DEMO_USER_ID,
    version: 1,
  },
  {
    _id: DEMO_INGREDIENT_IDS.foodShot,
    brand: DEMO_BRAND_FOOD_ID,
    category: 'image',
    isDefault: false,
    isDeleted: false,
    isFavorite: true,
    isHighlighted: false,
    isPublic: false,
    metadata: DEMO_METADATA_IDS.foodShot,
    order: 0,
    organization: DEMO_ORG_ID,
    scope: 'organization',
    status: 'generated',
    tags: [],
    transformations: [],
    user: DEMO_USER_ID,
    version: 1,
  },
  {
    _id: DEMO_INGREDIENT_IDS.promoClip,
    brand: DEMO_BRAND_TECH_ID,
    category: 'video',
    isDefault: false,
    isDeleted: false,
    isFavorite: false,
    isHighlighted: false,
    isPublic: false,
    metadata: DEMO_METADATA_IDS.promoClip,
    order: 1,
    organization: DEMO_ORG_ID,
    scope: 'organization',
    status: 'generated',
    tags: [],
    transformations: ['captioned'],
    user: DEMO_USER_ID,
    version: 1,
  },
];

// ============================================================================
// TRAININGS
// ============================================================================

const TRAININGS_COLLECTION = 'trainings';
const TRAINING_FIELDS_TO_CHECK = [
  'label',
  'description',
  'trigger',
  'category',
  'status',
  'steps',
  'model',
  'provider',
  'isDeleted',
  'isActive',
];

interface TrainingDocument {
  _id: ObjectId;
  organization: ObjectId;
  brand: ObjectId;
  user: ObjectId;
  sources: ObjectId[];
  label: string;
  description: string;
  provider: string;
  model: string;
  trigger: string;
  category: string;
  status: string;
  steps: number;
  seed: number;
  isDeleted: boolean;
  isActive: boolean;
  baseModel: string;
  startedAt: Date;
  completedAt: Date;
  progress: number;
  stage: string;
}

const trainings: TrainingDocument[] = [
  {
    _id: DEMO_TRAINING_IDS.productShots,
    baseModel: 'genfeed-ai/z-image-turbo',
    brand: DEMO_BRAND_LIFESTYLE_ID,
    category: 'subject',
    completedAt: new Date('2024-11-15T14:30:00Z'),
    description:
      'Fine-tuned model for generating lifestyle product photography with consistent brand aesthetics.',
    isActive: true,
    isDeleted: false,
    label: 'Lifestyle Product Shots',
    model:
      'replicate/fast-flux-trainer:f463fbfc97389e10a2f443a8a84b6953b1058eafbf0c9af4d84457ff07cb04db',
    organization: DEMO_ORG_ID,
    progress: 100,
    provider: 'replicate',
    seed: 42,
    sources: [
      DEMO_INGREDIENT_IDS.heroImage,
      DEMO_INGREDIENT_IDS.lifestylePhoto,
    ],
    stage: 'completed',
    startedAt: new Date('2024-11-15T12:00:00Z'),
    status: 'completed',
    steps: 1500,
    trigger: 'VIVID_PRODUCT',
    user: DEMO_USER_ID,
  },
  {
    _id: DEMO_TRAINING_IDS.styleTransfer,
    baseModel: 'genfeed-ai/z-image-turbo',
    brand: DEMO_BRAND_TECH_ID,
    category: 'style',
    completedAt: new Date('2024-12-01T10:45:00Z'),
    description:
      'Style-trained model that captures the Nexus Tech visual identity for consistent branding.',
    isActive: true,
    isDeleted: false,
    label: 'Nexus Brand Style',
    model:
      'replicate/fast-flux-trainer:f463fbfc97389e10a2f443a8a84b6953b1058eafbf0c9af4d84457ff07cb04db',
    organization: DEMO_ORG_ID,
    progress: 100,
    provider: 'replicate',
    seed: 7,
    sources: [DEMO_INGREDIENT_IDS.techBanner],
    stage: 'completed',
    startedAt: new Date('2024-12-01T08:00:00Z'),
    status: 'completed',
    steps: 2000,
    trigger: 'NEXUS_STYLE',
    user: DEMO_USER_ID,
  },
  {
    _id: DEMO_TRAINING_IDS.brandPortrait,
    baseModel: 'genfeed-ai/z-image-turbo',
    brand: DEMO_BRAND_FOOD_ID,
    category: 'subject',
    completedAt: new Date('2025-01-10T16:20:00Z'),
    description:
      'Trained on culinary photography for generating appetizing food and recipe visuals.',
    isActive: true,
    isDeleted: false,
    label: 'Culinary Photography',
    model:
      'replicate/fast-flux-trainer:f463fbfc97389e10a2f443a8a84b6953b1058eafbf0c9af4d84457ff07cb04db',
    organization: DEMO_ORG_ID,
    progress: 100,
    provider: 'replicate',
    seed: 99,
    sources: [DEMO_INGREDIENT_IDS.foodShot],
    stage: 'completed',
    startedAt: new Date('2025-01-10T14:00:00Z'),
    status: 'completed',
    steps: 1200,
    trigger: 'SPICE_FOOD',
    user: DEMO_USER_ID,
  },
];

// ============================================================================
// WORKFLOWS
// ============================================================================

const WORKFLOWS_COLLECTION = 'workflows';
const WORKFLOW_FIELDS_TO_CHECK = [
  'label',
  'name',
  'description',
  'trigger',
  'status',
  'lifecycle',
  'isTemplate',
  'isDeleted',
  'nodes',
  'edges',
];

interface WorkflowDocument {
  _id: ObjectId;
  user: ObjectId;
  organization: ObjectId;
  label: string;
  name: string;
  description: string;
  trigger: string;
  status: string;
  lifecycle: string;
  isTemplate: boolean;
  isDeleted: boolean;
  isPublic: boolean;
  isScheduleEnabled: boolean;
  executionCount: number;
  progress: number;
  nodes: unknown[];
  edges: unknown[];
  inputVariables: unknown[];
  steps: unknown[];
  tags: ObjectId[];
  brands: ObjectId[];
  lockedNodeIds: string[];
  webhookAuthType: string;
  webhookTriggerCount: number;
}

const workflows: WorkflowDocument[] = [
  {
    _id: DEMO_WORKFLOW_IDS.socialPipeline,
    brands: [DEMO_BRAND_LIFESTYLE_ID],
    description:
      'Generates social media content across platforms from a single topic input. Creates images, captions, and schedules posts.',
    edges: [
      {
        id: 'e-topic-image',
        source: 'node-topic-input',
        sourceHandle: 'output',
        target: 'node-generate-image',
        targetHandle: 'input',
      },
      {
        id: 'e-image-caption',
        source: 'node-generate-image',
        sourceHandle: 'output',
        target: 'node-caption',
        targetHandle: 'input',
      },
      {
        id: 'e-caption-publish',
        source: 'node-caption',
        sourceHandle: 'output',
        target: 'node-publish',
        targetHandle: 'input',
      },
    ],
    executionCount: 47,

    inputVariables: [
      {
        defaultValue: '',
        description: 'The main topic for content generation',
        key: 'topic',
        label: 'Content Topic',
        required: true,
        type: 'text',
      },
    ],
    isDeleted: false,
    isPublic: false,
    isScheduleEnabled: false,
    isTemplate: false,
    label: 'Social Media Pipeline',
    lifecycle: 'published',
    lockedNodeIds: [],
    name: 'Social Media Pipeline',
    nodes: [
      {
        data: {
          config: { placeholder: 'Enter your content topic...' },
          label: 'Topic Input',
        },
        id: 'node-topic-input',
        position: { x: 100, y: 200 },
        type: 'text-input',
      },
      {
        data: {
          config: {
            model: 'genfeed-ai/z-image-turbo',
            negativePrompt: 'blurry, low quality',
            style: 'photorealistic',
          },
          label: 'Generate Image',
        },
        id: 'node-generate-image',
        position: { x: 400, y: 200 },
        type: 'generate-image',
      },
      {
        data: {
          config: {
            maxLength: 280,
            platforms: ['instagram', 'twitter'],
            tone: 'engaging',
          },
          label: 'Generate Caption',
        },
        id: 'node-caption',
        position: { x: 700, y: 200 },
        type: 'caption',
      },
      {
        data: {
          config: { platforms: ['instagram', 'twitter'], schedule: 'optimal' },
          label: 'Publish',
        },
        id: 'node-publish',
        position: { x: 1000, y: 200 },
        type: 'publish',
      },
    ],
    organization: DEMO_ORG_ID,
    progress: 0,
    status: 'active',
    steps: [],
    tags: [],
    trigger: 'manual',
    user: DEMO_USER_ID,
    webhookAuthType: 'secret',
    webhookTriggerCount: 0,
  },
  {
    _id: DEMO_WORKFLOW_IDS.blogToVideo,
    brands: [DEMO_BRAND_TECH_ID],
    description:
      'Converts blog articles into short-form video content with text overlays and background music.',
    edges: [
      {
        id: 'e-article-script',
        source: 'node-article-input',
        sourceHandle: 'output',
        target: 'node-script-gen',
        targetHandle: 'input',
      },
      {
        id: 'e-script-video',
        source: 'node-script-gen',
        sourceHandle: 'output',
        target: 'node-gen-video',
        targetHandle: 'input',
      },
      {
        id: 'e-video-overlay',
        source: 'node-gen-video',
        sourceHandle: 'output',
        target: 'node-text-overlay',
        targetHandle: 'input',
      },
      {
        id: 'e-overlay-music',
        source: 'node-text-overlay',
        sourceHandle: 'output',
        target: 'node-music',
        targetHandle: 'input',
      },
    ],
    executionCount: 12,

    inputVariables: [
      {
        defaultValue: '',
        description: 'URL or text of the blog article to convert',
        key: 'article',
        label: 'Blog Article',
        required: true,
        type: 'text',
      },
    ],
    isDeleted: false,
    isPublic: false,
    isScheduleEnabled: false,
    isTemplate: false,
    label: 'Blog to Video',
    lifecycle: 'published',
    lockedNodeIds: [],
    name: 'Blog to Video',
    nodes: [
      {
        data: {
          config: { placeholder: 'Paste blog URL or content...' },
          label: 'Article Input',
        },
        id: 'node-article-input',
        position: { x: 100, y: 250 },
        type: 'text-input',
      },
      {
        data: {
          config: { maxLength: 60, style: 'concise' },
          label: 'Script Generator',
        },
        id: 'node-script-gen',
        position: { x: 400, y: 250 },
        type: 'generate-hook',
      },
      {
        data: {
          config: {
            duration: 30,
            model: 'genfeed-ai/z-image-turbo',
            resolution: '1080x1920',
          },
          label: 'Generate Video',
        },
        id: 'node-gen-video',
        position: { x: 700, y: 250 },
        type: 'generate-video',
      },
      {
        data: {
          config: { font: 'bold', position: 'center' },
          label: 'Text Overlay',
        },
        id: 'node-text-overlay',
        position: { x: 1000, y: 250 },
        type: 'text-overlay',
      },
      {
        data: {
          config: { genre: 'ambient', volume: 0.3 },
          label: 'Add Music',
        },
        id: 'node-music',
        position: { x: 1300, y: 250 },
        type: 'generate-music',
      },
    ],
    organization: DEMO_ORG_ID,
    progress: 0,
    status: 'active',
    steps: [],
    tags: [],
    trigger: 'manual',
    user: DEMO_USER_ID,
    webhookAuthType: 'secret',
    webhookTriggerCount: 0,
  },
  {
    _id: DEMO_WORKFLOW_IDS.thumbnailGen,
    brands: [DEMO_BRAND_FOOD_ID],
    description:
      'Generates eye-catching thumbnails for YouTube videos and social posts using AI image generation.',
    edges: [
      {
        id: 'e-title-image',
        source: 'node-title-input',
        sourceHandle: 'output',
        target: 'node-thumbnail-gen',
        targetHandle: 'input',
      },
      {
        id: 'e-image-upscale',
        source: 'node-thumbnail-gen',
        sourceHandle: 'output',
        target: 'node-upscale',
        targetHandle: 'input',
      },
    ],
    executionCount: 83,

    inputVariables: [
      {
        defaultValue: '',
        description: 'Video title for thumbnail generation',
        key: 'title',
        label: 'Video Title',
        required: true,
        type: 'text',
      },
    ],
    isDeleted: false,
    isPublic: false,
    isScheduleEnabled: false,
    isTemplate: false,
    label: 'Thumbnail Generator',
    lifecycle: 'published',
    lockedNodeIds: [],
    name: 'Thumbnail Generator',
    nodes: [
      {
        data: {
          config: { placeholder: 'Enter video title...' },
          label: 'Title Input',
        },
        id: 'node-title-input',
        position: { x: 200, y: 300 },
        type: 'text-input',
      },
      {
        data: {
          config: {
            model: 'genfeed-ai/z-image-turbo',
            resolution: '1280x720',
            style: 'vibrant',
          },
          label: 'Generate Thumbnail',
        },
        id: 'node-thumbnail-gen',
        position: { x: 550, y: 300 },
        type: 'generate-image',
      },
      {
        data: {
          config: { factor: 2, model: 'real-esrgan' },
          label: 'Upscale',
        },
        id: 'node-upscale',
        position: { x: 900, y: 300 },
        type: 'upscale',
      },
    ],
    organization: DEMO_ORG_ID,
    progress: 0,
    status: 'active',
    steps: [],
    tags: [],
    trigger: 'manual',
    user: DEMO_USER_ID,
    webhookAuthType: 'secret',
    webhookTriggerCount: 0,
  },
];

// ============================================================================
// ARTICLES
// ============================================================================

const ARTICLES_COLLECTION = 'articles';
const ARTICLE_FIELDS_TO_CHECK = [
  'label',
  'slug',
  'summary',
  'content',
  'category',
  'status',
  'isDeleted',
  'scope',
];

interface ArticleDocument {
  _id: ObjectId;
  user: ObjectId;
  organization: ObjectId;
  brand: ObjectId;
  label: string;
  slug: string;
  summary: string;
  content: string;
  category: string;
  status: string;
  scope: string;
  isDeleted: boolean;
  publishedAt?: Date;
  performanceMetrics?: {
    views: number;
    shares: number;
    likes: number;
    comments: number;
    engagementRate: number;
    clickThroughRate: number;
    lastUpdated: Date;
  };
  tags: ObjectId[];
}

const articles: ArticleDocument[] = [
  {
    _id: DEMO_ARTICLE_IDS.aiContentStrategy,
    brand: DEMO_BRAND_TECH_ID,
    category: 'guide',
    content: `# AI-Powered Content Strategy: A Complete Guide for 2025

The landscape of content creation has shifted dramatically with AI. In this guide, we explore how to build an effective content strategy that leverages AI tools while maintaining authenticity.

## Why AI Content Matters

Content teams are producing 3x more output with AI assistance. But volume alone isn't the answer — the key is using AI to enhance creativity, not replace it.

## Key Principles

1. **Start with human insight** — AI amplifies ideas, it doesn't originate them
2. **Maintain brand voice** — Use custom-trained models to keep consistency
3. **Iterate rapidly** — Generate variants and test what resonates
4. **Measure everything** — Let data guide your content calendar

## Implementation Steps

### Phase 1: Foundation
Set up your brand guidelines, train custom models, and establish content pillars.

### Phase 2: Production
Build workflows that automate repetitive tasks while keeping creative control.

### Phase 3: Optimization
Use analytics to refine your approach and double down on what works.

## Conclusion

AI is a tool, not a replacement. The best content strategies combine human creativity with AI efficiency.`,
    isDeleted: false,
    label: 'AI-Powered Content Strategy: A Complete Guide',
    organization: DEMO_ORG_ID,
    performanceMetrics: {
      clickThroughRate: 4.8,
      comments: 89,
      engagementRate: 6.2,
      lastUpdated: new Date('2025-02-01'),
      likes: 342,
      shares: 127,
      views: 12450,
    },
    publishedAt: new Date('2025-01-15'),
    scope: 'organization',
    slug: 'demo-ai-content-strategy-guide-2025',
    status: 'public',
    summary:
      'Learn how to build an effective content strategy that leverages AI tools while maintaining brand authenticity and creative quality.',
    tags: [],
    user: DEMO_USER_ID,
  },
  {
    _id: DEMO_ARTICLE_IDS.videoMarketingGuide,
    brand: DEMO_BRAND_LIFESTYLE_ID,
    category: 'tutorial',
    content: `# Video Marketing in the Age of AI: From Concept to Viral

Video continues to dominate social media engagement. Here's how to create compelling video content using AI workflows.

## The Video-First Approach

Short-form video drives 2.5x more engagement than static posts. Platforms like TikTok, Reels, and Shorts have made video creation essential.

## AI Video Workflow

1. **Ideation** — Use trend analysis to find topics
2. **Scripting** — AI-assisted script generation with hooks
3. **Production** — Automated video generation and editing
4. **Distribution** — Multi-platform publishing with adapted formats

## Tips for Success

- Hook viewers in the first 3 seconds
- Use text overlays for sound-off viewing
- Post consistently using scheduling tools
- Analyze performance and iterate

## Measuring Impact

Track views, completion rate, shares, and conversion to understand what resonates with your audience.`,
    isDeleted: false,
    label: 'Video Marketing in the Age of AI',
    organization: DEMO_ORG_ID,
    performanceMetrics: {
      clickThroughRate: 3.5,
      comments: 56,
      engagementRate: 5.8,
      lastUpdated: new Date('2025-02-10'),
      likes: 218,
      shares: 94,
      views: 8320,
    },
    publishedAt: new Date('2025-02-01'),
    scope: 'organization',
    slug: 'demo-video-marketing-ai-guide',
    status: 'public',
    summary:
      'Master video marketing with AI-powered workflows. From concept to viral content, learn the complete process.',
    tags: [],
    user: DEMO_USER_ID,
  },
  {
    _id: DEMO_ARTICLE_IDS.socialMediaTips,
    brand: DEMO_BRAND_FOOD_ID,
    category: 'post',
    content: `# 10 Social Media Tips for Food Brands in 2025

Food content is one of the most engaging categories on social media. Here are proven strategies to grow your food brand's online presence.

## 1. Shoot Overhead
Bird's eye view shots are the gold standard for food photography.

## 2. Use Natural Light
Natural lighting makes food look more appetizing than harsh studio lights.

## 3. Tell the Story
Share the process, not just the result. Behind-the-scenes content builds connection.

## 4. Leverage AI for Consistency
Use trained models to maintain a consistent visual style across all posts.

## 5. Engage with Comments
Reply to every comment in the first hour. It signals the algorithm and builds community.

## 6. Post at Peak Times
Use analytics to find when your audience is most active.

## 7. Cross-Pollinate Platforms
Adapt content for each platform's unique format and audience.

## 8. Use Trending Audio
On Reels and TikTok, trending audio can significantly boost reach.

## 9. Collaborate with Creators
Partner with food creators who align with your brand values.

## 10. Track and Iterate
Use performance data to refine your content strategy monthly.`,
    isDeleted: false,
    label: '10 Social Media Tips for Food Brands',
    organization: DEMO_ORG_ID,
    scope: 'organization',
    slug: 'demo-social-media-tips-food-brands',
    status: 'draft',
    summary:
      'Proven strategies to grow your food brand on social media with AI-powered content creation.',
    tags: [],
    user: DEMO_USER_ID,
  },
];

// ============================================================================
// CONTENT PERFORMANCE (analytics data)
// ============================================================================

const PERFORMANCE_COLLECTION = 'content_performance';
const PERFORMANCE_FIELDS_TO_CHECK = [
  'views',
  'likes',
  'comments',
  'shares',
  'saves',
  'clicks',
  'engagementRate',
  'performanceScore',
  'isDeleted',
];

interface PerformanceDocument {
  _id: ObjectId;
  organization: ObjectId;
  brand: ObjectId;
  user: ObjectId;
  platform: string;
  contentType: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  revenue: number;
  engagementRate: number;
  performanceScore: number;
  measuredAt: Date;
  cycleNumber: number;
  source: string;
  isDeleted: boolean;
  generationId?: string;
}

function generatePerformanceData(): PerformanceDocument[] {
  const records: PerformanceDocument[] = [];
  let idCounter = 0x80;

  const platforms = ['instagram', 'tiktok', 'youtube', 'twitter'] as const;
  const contentTypes = ['video', 'image', 'article'] as const;

  const brandConfigs = [
    { brand: DEMO_BRAND_LIFESTYLE_ID, multiplier: 1.2 },
    { brand: DEMO_BRAND_TECH_ID, multiplier: 0.9 },
    { brand: DEMO_BRAND_FOOD_ID, multiplier: 1.5 },
  ];

  // Generate 30 days of analytics data
  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    date.setHours(12, 0, 0, 0);

    for (const { brand, multiplier } of brandConfigs) {
      // 2-3 entries per brand per day
      const entriesPerDay = 2 + (dayOffset % 2);

      for (let entry = 0; entry < entriesPerDay; entry++) {
        const platform = platforms[(dayOffset + entry) % platforms.length];
        const contentType =
          contentTypes[(dayOffset + entry) % contentTypes.length];

        // Deterministic but realistic-looking metrics using day offset
        const baseViews = 500 + ((dayOffset * 137 + entry * 43) % 4500);
        const views = Math.round(baseViews * multiplier);
        const likes = Math.round(views * (0.03 + ((dayOffset * 7) % 5) / 100));
        const comments = Math.round(likes * (0.1 + ((entry * 11) % 8) / 100));
        const shares = Math.round(likes * (0.05 + ((dayOffset * 3) % 4) / 100));
        const saves = Math.round(likes * (0.15 + ((entry * 5) % 6) / 100));
        const clicks = Math.round(
          views * (0.02 + ((dayOffset * 13) % 3) / 100),
        );
        const engagementRate =
          Math.round(((likes + comments + shares) / views) * 10000) / 100;
        const performanceScore = Math.min(
          100,
          Math.round(engagementRate * 8 + views / 100),
        );

        const idHex = (idCounter++).toString(16).padStart(2, '0');
        const id = new ObjectId(`6600000000000000000000${idHex}`);

        records.push({
          _id: id,
          brand,
          clicks,
          comments,
          contentType,
          cycleNumber: 1,
          engagementRate,
          isDeleted: false,
          likes,
          measuredAt: date,
          organization: DEMO_ORG_ID,
          performanceScore,
          platform,
          revenue: 0,
          saves,
          shares,
          source: 'manual',
          user: DEMO_USER_ID,
          views,
        });
      }
    }
  }

  return records;
}

// ============================================================================
// ARTICLE ANALYTICS
// ============================================================================

const ARTICLE_ANALYTICS_COLLECTION = 'article-analytics';
const ARTICLE_ANALYTICS_FIELDS_TO_CHECK = [
  'totalViews',
  'totalLikes',
  'totalComments',
  'totalShares',
  'engagementRate',
  'clickThroughRate',
  'isDeleted',
];

interface ArticleAnalyticsDocument {
  _id: ObjectId;
  article: ObjectId;
  user: ObjectId;
  organization: ObjectId;
  brand: ObjectId;
  date: Date;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  clickThroughRate: number;
  totalViewsIncrement: number;
  totalLikesIncrement: number;
  totalCommentsIncrement: number;
  totalSharesIncrement: number;
  engagementRate: number;
  isDeleted: boolean;
}

function generateArticleAnalytics(): ArticleAnalyticsDocument[] {
  const records: ArticleAnalyticsDocument[] = [];
  let idCounter = 0xa0;

  const articleConfigs = [
    {
      article: DEMO_ARTICLE_IDS.aiContentStrategy,
      baseViews: 800,
      brand: DEMO_BRAND_TECH_ID,
    },
    {
      article: DEMO_ARTICLE_IDS.videoMarketingGuide,
      baseViews: 600,
      brand: DEMO_BRAND_LIFESTYLE_ID,
    },
  ];

  // 14 days of article analytics
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    date.setHours(0, 0, 0, 0);

    for (const { article, brand, baseViews } of articleConfigs) {
      const dayViews = baseViews + ((dayOffset * 97) % 400);
      const dayLikes = Math.round(dayViews * 0.04);
      const dayComments = Math.round(dayViews * 0.008);
      const dayShares = Math.round(dayViews * 0.015);

      const cumulativeViews = dayViews * (14 - dayOffset);
      const cumulativeLikes = dayLikes * (14 - dayOffset);
      const cumulativeComments = dayComments * (14 - dayOffset);
      const cumulativeShares = dayShares * (14 - dayOffset);

      const idHex = (idCounter++).toString(16).padStart(2, '0');
      const id = new ObjectId(`6600000000000000000000${idHex}`);

      records.push({
        _id: id,
        article,
        brand,
        clickThroughRate:
          Math.round((dayViews * 0.03 + ((dayOffset * 7) % 3)) * 100) / 100,
        date,
        engagementRate:
          Math.round(
            ((dayLikes + dayComments + dayShares) / dayViews) * 10000,
          ) / 100,
        isDeleted: false,
        organization: DEMO_ORG_ID,
        totalComments: cumulativeComments,
        totalCommentsIncrement: dayComments,
        totalLikes: cumulativeLikes,
        totalLikesIncrement: dayLikes,
        totalShares: cumulativeShares,
        totalSharesIncrement: dayShares,
        totalViews: cumulativeViews,
        totalViewsIncrement: dayViews,
        user: DEMO_USER_ID,
      });
    }
  }

  return records;
}

// ============================================================================
// RUN SEED
// ============================================================================

const args = parseArgs();

runScript(
  'Demo Organization Seed',
  async (db) => {
    const results: Record<string, unknown> = {};

    // 1. Organizations
    logger.log('\n🏢 Seeding Demo Organization...\n');
    results.organizations = await seedDocuments(
      db,
      ORGS_COLLECTION,
      organizations,
      {
        dryRun: args.dryRun,
        fieldsToCheck: ORG_FIELDS_TO_CHECK,
        keyField: '_id',
      },
    );

    // 2. Brands
    logger.log('\n🎨 Seeding Brands...\n');
    results.brands = await seedDocuments(db, BRANDS_COLLECTION, brands, {
      dryRun: args.dryRun,
      fieldsToCheck: BRAND_FIELDS_TO_CHECK,
      keyField: '_id',
    });

    // 3. Metadata (must come before ingredients)
    logger.log('\n📋 Seeding Metadata...\n');
    results.metadata = await seedDocuments(db, METADATA_COLLECTION, metadata, {
      dryRun: args.dryRun,
      fieldsToCheck: METADATA_FIELDS_TO_CHECK,
      keyField: '_id',
    });

    // 4. Ingredients (content items)
    logger.log('\n📸 Seeding Ingredients...\n');
    results.ingredients = await seedDocuments(
      db,
      INGREDIENTS_COLLECTION,
      ingredients,
      {
        dryRun: args.dryRun,
        fieldsToCheck: INGREDIENT_FIELDS_TO_CHECK,
        keyField: '_id',
      },
    );

    // 5. Trainings
    logger.log('\n🧠 Seeding Trainings...\n');
    results.trainings = await seedDocuments(
      db,
      TRAININGS_COLLECTION,
      trainings,
      {
        dryRun: args.dryRun,
        fieldsToCheck: TRAINING_FIELDS_TO_CHECK,
        keyField: '_id',
      },
    );

    // 6. Workflows
    logger.log('\n⚡ Seeding Workflows...\n');
    results.workflows = await seedDocuments(
      db,
      WORKFLOWS_COLLECTION,
      workflows,
      {
        dryRun: args.dryRun,
        fieldsToCheck: WORKFLOW_FIELDS_TO_CHECK,
        keyField: '_id',
      },
    );

    // 7. Articles
    logger.log('\n📝 Seeding Articles...\n');
    results.articles = await seedDocuments(db, ARTICLES_COLLECTION, articles, {
      dryRun: args.dryRun,
      fieldsToCheck: ARTICLE_FIELDS_TO_CHECK,
      keyField: '_id',
    });

    // 8. Content Performance (analytics)
    const performanceData = generatePerformanceData();
    logger.log(
      `\n📊 Seeding Content Performance (${performanceData.length} records)...\n`,
    );
    results.contentPerformance = await seedDocuments(
      db,
      PERFORMANCE_COLLECTION,
      performanceData,
      {
        dryRun: args.dryRun,
        fieldsToCheck: PERFORMANCE_FIELDS_TO_CHECK,
        keyField: '_id',
      },
    );

    // 9. Article Analytics
    const articleAnalytics = generateArticleAnalytics();
    logger.log(
      `\n📈 Seeding Article Analytics (${articleAnalytics.length} records)...\n`,
    );
    results.articleAnalytics = await seedDocuments(
      db,
      ARTICLE_ANALYTICS_COLLECTION,
      articleAnalytics,
      {
        dryRun: args.dryRun,
        fieldsToCheck: ARTICLE_ANALYTICS_FIELDS_TO_CHECK,
        keyField: '_id',
      },
    );

    // Final summary
    logger.log('\n' + '═'.repeat(60));
    logger.log('🎉 DEMO SEED COMPLETE');
    logger.log('═'.repeat(60));
    logger.log(`Organization: GenFeed Demo (${DEMO_ORG_ID.toHexString()})`);
    logger.log(`Brands: ${brands.length}`);
    logger.log(`Ingredients: ${ingredients.length}`);
    logger.log(`Trainings: ${trainings.length}`);
    logger.log(`Workflows: ${workflows.length}`);
    logger.log(`Articles: ${articles.length}`);
    logger.log(`Performance records: ${performanceData.length}`);
    logger.log(`Article analytics: ${articleAnalytics.length}`);
    logger.log('═'.repeat(60));

    return results;
  },
  { database: args.database, uri: args.uri },
).catch((error) => {
  logger.error('Demo seed failed:', error);
  process.exit(1);
});

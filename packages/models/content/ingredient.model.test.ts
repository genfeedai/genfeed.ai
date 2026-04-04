import type {
  IAsset,
  IBrand,
  IIngredient,
  IMetadata,
  IOrganization,
  IOrganizationSetting,
  IPrompt,
  ISetting,
  ITag,
  IUser,
} from '@genfeedai/interfaces';
import {
  AssetCategory,
  AssetParent,
  AssetScope,
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
  TagCategory,
} from '@genfeedai/enums';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@genfeedai/client/models', () => ({
  Ingredient: class MockIngredient {
    id: string = '';
    category: string = '';
    status: string = '';
    brand: unknown;
    user: unknown;
    metadata: unknown;
    references: unknown[] = [];
    prompt: unknown;
    script: unknown;
    parent: unknown;
    sources: unknown[] = [];
    tags: string[] = [];
    isFavorite: boolean = false;

    constructor(partial: Record<string, unknown>) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/auth/user.model', () => ({
  User: class MockUser {
    id: string;
    constructor(partial: Record<string, unknown>) {
      this.id = (partial.id as string) || '';
    }
  },
}));

vi.mock('@models/content/metadata.model', () => ({
  Metadata: class MockMetadata {
    label?: string;
    description?: string;
    width?: number;
    height?: number;
    extension?: string;
    duration?: number;
    size?: number;
    model?: string;
    modelLabel?: string;
    style?: string;
    tags?: string[];

    constructor(partial: Record<string, unknown>) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/content/prompt.model', () => ({
  Prompt: class MockPrompt {
    original?: string;
    enhanced?: string;
    constructor(partial: Record<string, unknown>) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/ingredients/asset.model', () => ({
  Asset: class MockAsset {
    id: string;
    url?: string;
    constructor(partial: Record<string, unknown>) {
      this.id = (partial.id as string) || '';
      this.url = partial.url as string;
    }
  },
}));

vi.mock('@models/organization/brand.model', () => ({
  Brand: class MockBrand {
    id: string;
    label: string;
    logo?: unknown;
    constructor(partial: Record<string, unknown>) {
      this.id = (partial.id as string) || '';
      this.label = (partial.label as string) || '';
      this.logo = partial.logo;
    }
  },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    assetsEndpoint: 'https://assets.genfeed.ai',
    ingredientsEndpoint: 'https://ingredients.genfeed.ai',
  },
}));

vi.mock('@utils/media/ingredients.util', () => ({
  IngredientEndpoints: {
    getEndpoint: vi.fn((category: string) => {
      const map: Record<string, string> = {
        GIF: 'gifs',
        IMAGE: 'images',
        MUSIC: 'musics',
        VIDEO: 'videos',
        VOICE: 'voices',
      };
      return map[category] || 'images';
    }),
  },
}));

vi.mock('@utils/media/reference.util', () => ({
  resolveIngredientReferenceUrl: vi.fn((ref) => {
    if (!ref) {
      return null;
    }
    if (typeof ref === 'string') {
      return `https://ref.url/${ref}`;
    }
    if (Array.isArray(ref) && ref.length > 0) {
      const first = ref[0];
      if (typeof first === 'string') {
        return `https://ref.url/${first}`;
      }
      return first.url || `https://ref.url/${first.id}`;
    }
    if (typeof ref === 'object' && ref.url) {
      return ref.url;
    }
    if (typeof ref === 'object' && ref.id) {
      return `https://ref.url/${ref.id}`;
    }
    return null;
  }),
}));

// Import after mocks
import { Ingredient } from '@models/content/ingredient.model';

const createBaseEntity = <T extends { id: string }>(
  partial: Partial<T> = {},
): Pick<T, 'id'> & {
  createdAt: string;
  isDeleted: boolean;
  updatedAt: string;
} => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  id: (partial.id ?? 'entity-1') as string,
  isDeleted: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const createSetting = (partial: Partial<ISetting> = {}): ISetting => ({
  ...createBaseEntity<ISetting>(partial),
  contentPreferences: [],
  isAdvancedMode: false,
  isFirstLogin: false,
  isMenuCollapsed: false,
  isTrendNotificationsEmail: false,
  isTrendNotificationsInApp: false,
  isTrendNotificationsTelegram: false,
  isVerified: false,
  theme: 'light',
  trendNotificationsFrequency: 'daily',
  trendNotificationsMinViralScore: 0,
  ...partial,
});

const createUser = (partial: Partial<IUser> = {}): IUser => ({
  ...createBaseEntity<IUser>(partial),
  clerkId: 'clerk_123',
  email: 'test@example.com',
  firstName: 'Test',
  handle: 'test-user',
  lastName: 'User',
  settings: createSetting(),
  ...partial,
});

const createOrganizationSetting = (
  partial: Partial<IOrganizationSetting> = {},
): IOrganizationSetting => ({
  ...createBaseEntity<IOrganizationSetting>(partial),
  brandsLimit: 1,
  isAdvancedMode: false,
  isAutoEvaluateEnabled: false,
  isDarkroomNsfwVisible: false,
  isGenerateArticlesEnabled: true,
  isGenerateImagesEnabled: true,
  isGenerateMusicEnabled: true,
  isGenerateVideosEnabled: true,
  isNotificationsDiscordEnabled: false,
  isNotificationsEmailEnabled: false,
  isVerifyIngredientEnabled: false,
  isVerifyScriptEnabled: false,
  isVerifyVideoEnabled: false,
  isVoiceControlEnabled: false,
  isWatermarkEnabled: false,
  isWebhookEnabled: false,
  isWhitelabelEnabled: false,
  seatsLimit: 1,
  ...partial,
});

const createOrganization = (
  partial: Partial<IOrganization> = {},
): IOrganization => ({
  ...createBaseEntity<IOrganization>(partial),
  isSelected: false,
  label: 'Test Organization',
  settings: createOrganizationSetting(),
  user: createUser(),
  ...partial,
});

const createBrand = (partial: Partial<IBrand> = {}): IBrand => ({
  ...createBaseEntity<IBrand>(partial),
  backgroundColor: '#000000',
  credentials: [],
  description: 'Brand description',
  fontFamily: 'Inter',
  handle: 'test-brand',
  isActive: true,
  isDarkroomEnabled: false,
  isDefault: false,
  isSelected: false,
  isVerified: false,
  label: 'Test Brand',
  links: [],
  organization: createOrganization(),
  primaryColor: '#ffffff',
  scope: AssetScope.BRAND,
  secondaryColor: '#cccccc',
  user: createUser(),
  ...partial,
});

const createAsset = (partial: Partial<IAsset> = {}): IAsset => ({
  ...createBaseEntity<IAsset>(partial),
  category: AssetCategory.REFERENCE,
  parent: 'parent-123',
  parentModel: AssetParent.INGREDIENT,
  url: 'https://example.com/asset.png',
  user: createUser(),
  ...partial,
});

const createTag = (partial: Partial<ITag> = {}): ITag => ({
  ...createBaseEntity<ITag>(partial),
  backgroundColor: '#000000',
  brand: createBrand(),
  category: TagCategory.INGREDIENT,
  label: 'tag',
  organization: createOrganization(),
  textColor: '#ffffff',
  user: createUser(),
  ...partial,
});

const createMetadata = (partial: Partial<IMetadata> = {}): IMetadata => ({
  ...createBaseEntity<IMetadata>(partial),
  label: 'Test metadata',
  ...partial,
});

const createPrompt = (partial: Partial<IPrompt> = {}): IPrompt => ({
  ...createBaseEntity<IPrompt>(partial),
  category: IngredientCategory.IMAGE,
  enhanced: 'Enhanced prompt',
  hasVoted: false,
  isSkipEnhancement: false,
  isVoteAnimating: false,
  original: 'Original prompt',
  status: 'ready',
  totalVotes: 0,
  user: 'user_123',
  ...partial,
});

const createIngredientFixture = (
  partial: Partial<IIngredient> = {},
): IIngredient => ({
  ...createBaseEntity<IIngredient>(partial),
  category: IngredientCategory.IMAGE,
  hasVoted: false,
  isDefault: false,
  isFavorite: false,
  isHighlighted: false,
  isVoteAnimating: false,
  organization: createOrganization(),
  scope: AssetScope.BRAND,
  status: IngredientStatus.GENERATED,
  totalChildren: 0,
  totalVotes: 0,
  user: createUser(),
  ...partial,
});

const createIngredient = (partial: Partial<IIngredient> = {}) =>
  new Ingredient(createIngredientFixture(partial));

describe('Ingredient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with partial data', () => {
      const ingredient = createIngredient({
        category: IngredientCategory.IMAGE,
        id: 'ing_123',
        status: IngredientStatus.GENERATED,
      });

      expect(ingredient.id).toBe('ing_123');
      expect(ingredient.category).toBe(IngredientCategory.IMAGE);
      expect(ingredient.status).toBe(IngredientStatus.GENERATED);
    });

    it('should initialize default values', () => {
      const ingredient = createIngredient({});

      expect(ingredient.isPlaying).toBe(false);
      expect(ingredient.isFavorite).toBe(false);
      expect(ingredient.isVoteAnimating).toBe(false);
      expect(ingredient.references).toEqual([]);
      expect(ingredient.sources).toEqual([]);
      expect(ingredient.tags).toEqual([]);
    });

    it('should initialize isFavorite from partial', () => {
      const ingredient = createIngredient({ isFavorite: true });

      expect(ingredient.isFavorite).toBe(true);
    });

    it('should handle brand as object', () => {
      const ingredient = createIngredient({
        brand: createBrand({ id: 'brand_123', label: 'Test Brand' }),
      });

      expect(ingredient.brand).toBeDefined();
    });

    it('should handle user as string', () => {
      const ingredient = createIngredient({ user: 'user_123' });

      expect(ingredient.user).toBe('user_123');
    });

    it('should handle user as object', () => {
      const ingredient = createIngredient({
        user: createUser({ id: 'user_123' }),
      });

      expect(ingredient.user).toBeDefined();
    });

    it('should handle metadata as string', () => {
      const ingredient = createIngredient({ metadata: 'meta_123' });

      expect(ingredient.metadata).toBe('meta_123');
    });

    it('should handle metadata as object', () => {
      const ingredient = createIngredient({
        metadata: createMetadata({ height: 1080, label: 'Test', width: 1920 }),
      });

      expect(ingredient.metadata).toBeDefined();
    });

    it('should handle references as string array', () => {
      const ingredient = createIngredient({
        references: ['ref_1', 'ref_2'],
      });

      expect(ingredient.references).toEqual(['ref_1', 'ref_2']);
    });

    it('should handle references as object array', () => {
      const ingredient = createIngredient({
        references: [
          createAsset({ id: 'ref_1', url: 'http://url1' }),
          createAsset({ id: 'ref_2', url: 'http://url2' }),
        ],
      });

      expect(ingredient.references).toHaveLength(2);
    });

    it('should handle empty references', () => {
      const ingredient = createIngredient({ references: [] });

      expect(ingredient.references).toEqual([]);
    });

    it('should handle prompt as string', () => {
      const ingredient = createIngredient({ prompt: 'A beautiful sunset' });

      expect(ingredient.prompt).toBe('A beautiful sunset');
    });

    it('should handle prompt as object', () => {
      const ingredient = createIngredient({
        prompt: createPrompt({
          enhanced: 'Enhanced prompt',
          original: 'Original prompt',
        }),
      });

      expect(ingredient.prompt).toBeDefined();
    });

    it('should handle script as string', () => {
      const ingredient = createIngredient({ script: 'script_123' });

      expect(ingredient.script).toBe('script_123');
    });

    it('should handle script as object (recursive)', () => {
      const ingredient = createIngredient({
        script: createIngredientFixture({
          category: IngredientCategory.VOICE,
          id: 'script_123',
        }),
      });

      expect(ingredient.script).toBeDefined();
    });

    it('should handle parent as string', () => {
      const ingredient = createIngredient({ parent: 'parent_123' });

      expect(ingredient.parent).toBe('parent_123');
    });

    it('should handle parent as object (recursive)', () => {
      const ingredient = createIngredient({
        parent: createIngredientFixture({
          category: IngredientCategory.IMAGE,
          id: 'parent_123',
        }),
      });

      expect(ingredient.parent).toBeDefined();
    });

    it('should handle sources as string array', () => {
      const ingredient = createIngredient({
        sources: ['source_1', 'source_2'],
      });

      expect(ingredient.sources).toEqual(['source_1', 'source_2']);
    });

    it('should handle sources as object array (recursive)', () => {
      const ingredient = createIngredient({
        sources: [
          createIngredientFixture({
            category: IngredientCategory.IMAGE,
            id: 'source_1',
          }),
          createIngredientFixture({
            category: IngredientCategory.VIDEO,
            id: 'source_2',
          }),
        ],
      });

      expect(ingredient.sources).toHaveLength(2);
    });

    it('should handle tags', () => {
      const ingredient = createIngredient({
        tags: [
          createTag({ id: 'tag1', label: 'tag1' }),
          createTag({ id: 'tag2', label: 'tag2' }),
          createTag({ id: 'tag3', label: 'tag3' }),
        ],
      });

      expect(ingredient.tags).toHaveLength(3);
    });
  });

  describe('metadata getters', () => {
    it('metadataLabel should return label or truncated id', () => {
      const withLabel = createIngredient({
        id: '12345678901234567890',
        metadata: createMetadata({ label: 'Custom Label' }),
      });
      expect(withLabel.metadataLabel).toBe('Custom Label');

      const withoutLabel = createIngredient({
        id: '12345678901234567890',
        metadata: createMetadata(),
      });
      expect(withoutLabel.metadataLabel).toBe('12345678');
    });

    it('metadataDescription should return description or empty', () => {
      const withDesc = createIngredient({
        metadata: createMetadata({ description: 'Test description' }),
      });
      expect(withDesc.metadataDescription).toBe('Test description');

      const withoutDesc = createIngredient({ metadata: createMetadata() });
      expect(withoutDesc.metadataDescription).toBe('');
    });

    it('metadataWidth should return width or default 1080', () => {
      const withWidth = createIngredient({
        metadata: createMetadata({ width: 1920 }),
      });
      expect(withWidth.metadataWidth).toBe(1920);

      const withoutWidth = createIngredient({ metadata: createMetadata() });
      expect(withoutWidth.metadataWidth).toBe(1080);
    });

    it('metadataHeight should return height or default 1920', () => {
      const withHeight = createIngredient({
        metadata: createMetadata({ height: 1080 }),
      });
      expect(withHeight.metadataHeight).toBe(1080);

      const withoutHeight = createIngredient({ metadata: createMetadata() });
      expect(withoutHeight.metadataHeight).toBe(1920);
    });

    it('metadataExtension should return extension or empty', () => {
      const withExt = createIngredient({
        metadata: createMetadata({ extension: 'mp4' }),
      });
      expect(withExt.metadataExtension).toBe('mp4');

      const withoutExt = createIngredient({ metadata: createMetadata() });
      expect(withoutExt.metadataExtension).toBe('');
    });

    it('metadataDuration should return duration or default 8', () => {
      const withDuration = createIngredient({
        metadata: createMetadata({ duration: 15 }),
      });
      expect(withDuration.metadataDuration).toBe(15);

      const withoutDuration = createIngredient({ metadata: createMetadata() });
      expect(withoutDuration.metadataDuration).toBe(8);
    });

    it('metadataSize should return size or default 0', () => {
      const withSize = createIngredient({
        metadata: createMetadata({ size: 1024000 }),
      });
      expect(withSize.metadataSize).toBe(1024000);

      const withoutSize = createIngredient({ metadata: createMetadata() });
      expect(withoutSize.metadataSize).toBe(0);
    });

    it('metadataModel should return model or empty', () => {
      const withModel = createIngredient({
        metadata: createMetadata({ model: 'flux-1.1' }),
      });
      expect(withModel.metadataModel).toBe('flux-1.1');

      const withoutModel = createIngredient({ metadata: createMetadata() });
      expect(withoutModel.metadataModel).toBe('');
    });

    it('metadataModelLabel should return modelLabel, model, or empty', () => {
      const withModelLabel = createIngredient({
        metadata: createMetadata({
          model: 'flux-1.1',
          modelLabel: 'Flux 1.1 Pro',
        }),
      });
      expect(withModelLabel.metadataModelLabel).toBe('Flux 1.1 Pro');

      const withOnlyModel = createIngredient({
        metadata: createMetadata({ model: 'flux-1.1' }),
      });
      expect(withOnlyModel.metadataModelLabel).toBe('flux-1.1');

      const withoutBoth = createIngredient({ metadata: createMetadata() });
      expect(withoutBoth.metadataModelLabel).toBe('');
    });

    it('metadataStyle should return style or empty', () => {
      const withStyle = createIngredient({
        metadata: createMetadata({ style: 'cinematic' }),
      });
      expect(withStyle.metadataStyle).toBe('cinematic');

      const withoutStyle = createIngredient({ metadata: createMetadata() });
      expect(withoutStyle.metadataStyle).toBe('');
    });

    it('metadataTags should return tags or empty array', () => {
      const withTags = createIngredient({
        metadata: createMetadata({
          tags: [
            createTag({ id: 'nature', label: 'nature' }),
            createTag({ id: 'sunset', label: 'sunset' }),
          ],
        }),
      });
      expect(withTags.metadataTags).toHaveLength(2);

      const withoutTags = createIngredient({ metadata: createMetadata() });
      expect(withoutTags.metadataTags).toEqual([]);
    });
  });

  describe('reference getters', () => {
    it('primaryReference should return first reference', () => {
      const ingredient = createIngredient({
        references: ['ref_1', 'ref_2'],
      });

      expect(ingredient.primaryReference).toBe('ref_1');
    });

    it('primaryReference should return undefined for empty references', () => {
      const ingredient = createIngredient({ references: [] });

      expect(ingredient.primaryReference).toBeUndefined();
    });

    it('resolveReferenceUrl should resolve reference URL', () => {
      const ingredient = createIngredient({});
      const result = ingredient.resolveReferenceUrl({
        ...createAsset({ id: 'ref_123', url: 'http://test.url' }),
      });

      expect(result).toBeDefined();
    });

    it('resolveReferenceUrl should return null for undefined', () => {
      const ingredient = createIngredient({});
      const result = ingredient.resolveReferenceUrl(undefined);

      expect(result).toBeNull();
    });

    it('primaryReferenceUrl should return resolved URL', () => {
      const ingredient = createIngredient({
        references: [createAsset({ id: 'ref_1', url: 'http://ref.url/ref_1' })],
      });

      expect(ingredient.primaryReferenceUrl).toBeDefined();
    });
  });

  describe('aspectRatio', () => {
    it('should return aspect-square for square dimensions', () => {
      const ingredient = createIngredient({
        metadata: createMetadata({ height: 1080, width: 1080 }),
      });

      expect(ingredient.aspectRatio).toBe('aspect-square');
    });

    it('should return aspect-[16/9] for landscape dimensions', () => {
      const ingredient = createIngredient({
        metadata: createMetadata({ height: 1080, width: 1920 }),
      });

      expect(ingredient.aspectRatio).toBe('aspect-[16/9]');
    });

    it('should return aspect-[9/16] for portrait dimensions', () => {
      const ingredient = createIngredient({
        metadata: createMetadata({ height: 1920, width: 1080 }),
      });

      expect(ingredient.aspectRatio).toBe('aspect-[9/16]');
    });
  });

  describe('ingredientFormat', () => {
    it('should return SQUARE for equal dimensions', () => {
      const ingredient = createIngredient({
        metadata: createMetadata({ height: 1080, width: 1080 }),
      });

      expect(ingredient.ingredientFormat).toBe(IngredientFormat.SQUARE);
    });

    it('should return LANDSCAPE for width > height', () => {
      const ingredient = createIngredient({
        metadata: createMetadata({ height: 1080, width: 1920 }),
      });

      expect(ingredient.ingredientFormat).toBe(IngredientFormat.LANDSCAPE);
    });

    it('should return PORTRAIT for width < height', () => {
      const ingredient = createIngredient({
        metadata: createMetadata({ height: 1920, width: 1080 }),
      });

      expect(ingredient.ingredientFormat).toBe(IngredientFormat.PORTRAIT);
    });
  });

  describe('promptText', () => {
    it('should return string prompt directly', () => {
      const ingredient = createIngredient({ prompt: 'A beautiful sunset' });

      expect(ingredient.promptText).toBe('A beautiful sunset');
    });

    it('should return enhanced prompt from object', () => {
      const ingredient = createIngredient({
        prompt: createPrompt({
          enhanced: 'Enhanced prompt',
          original: 'Original',
        }),
      });

      expect(ingredient.promptText).toBe('Enhanced prompt');
    });

    it('should return original if no enhanced', () => {
      const ingredient = createIngredient({
        prompt: createPrompt({ enhanced: '', original: 'Original prompt' }),
      });

      expect(ingredient.promptText).toBe('Original prompt');
    });

    it('should return empty string if no prompt', () => {
      const ingredient = createIngredient({});

      expect(ingredient.promptText).toBe('');
    });
  });

  describe('ingredientUrl', () => {
    it('should return placeholder for PROCESSING status (image)', () => {
      const ingredient = createIngredient({
        category: IngredientCategory.IMAGE,
        id: 'ing_123',
        metadata: createMetadata({ height: 1920, width: 1080 }),
        status: IngredientStatus.PROCESSING,
      });

      expect(ingredient.ingredientUrl).toContain('placeholders');
    });

    it('should return placeholder for PROCESSING status (music)', () => {
      const ingredient = createIngredient({
        category: IngredientCategory.MUSIC,
        id: 'ing_123',
        status: IngredientStatus.PROCESSING,
      });

      expect(ingredient.ingredientUrl).toContain('square.jpg');
    });

    it('should return placeholder for failed status', () => {
      const ingredient = createIngredient({
        category: IngredientCategory.VIDEO,
        id: 'ing_123',
        metadata: createMetadata({ height: 1080, width: 1920 }),
        status: IngredientStatus.FAILED,
      });

      expect(ingredient.ingredientUrl).toContain('placeholders');
    });

    it('should return ingredient URL for generated status', () => {
      const ingredient = createIngredient({
        category: IngredientCategory.IMAGE,
        id: 'ing_123',
        status: IngredientStatus.GENERATED,
      });

      expect(ingredient.ingredientUrl).toContain('ingredients.genfeed.ai');
      expect(ingredient.ingredientUrl).toContain('ing_123');
    });

    it('should cache ingredient URL', () => {
      const ingredient = createIngredient({
        category: IngredientCategory.IMAGE,
        id: 'ing_123',
        status: IngredientStatus.GENERATED,
      });

      const url1 = ingredient.ingredientUrl;
      const url2 = ingredient.ingredientUrl;

      expect(url1).toBe(url2);
    });
  });

  describe('thumbnailUrl', () => {
    it('should return portrait placeholder for portrait video', () => {
      const ingredient = createIngredient({
        category: IngredientCategory.VIDEO,
        metadata: createMetadata({ height: 1920, width: 1080 }),
      });

      expect(ingredient.thumbnailUrl).toContain('portrait.jpg');
    });

    it('should return landscape placeholder for landscape video', () => {
      const ingredient = createIngredient({
        category: IngredientCategory.VIDEO,
        metadata: createMetadata({ height: 1080, width: 1920 }),
      });

      expect(ingredient.thumbnailUrl).toContain('landscape.jpg');
    });

    it('should return square placeholder for square video', () => {
      const ingredient = createIngredient({
        category: IngredientCategory.VIDEO,
        metadata: createMetadata({ height: 1080, width: 1080 }),
      });

      expect(ingredient.thumbnailUrl).toContain('square.jpg');
    });

    it('should return square placeholder for music', () => {
      const ingredient = createIngredient({
        category: IngredientCategory.MUSIC,
      });

      expect(ingredient.thumbnailUrl).toContain('square.jpg');
    });

    it('should return undefined for image', () => {
      const ingredient = createIngredient({
        category: IngredientCategory.IMAGE,
      });

      expect(ingredient.thumbnailUrl).toBeUndefined();
    });
  });

  describe('brandLogoUrl', () => {
    it('should return logo URL when brand has logo', () => {
      const ingredient = createIngredient({
        brand: createBrand({
          id: 'brand_123',
          label: 'Test',
          logo: 'logo_123' as never,
        }),
      });

      expect(ingredient.brandLogoUrl).toContain('logos');
    });

    it('should return placeholder when no logo', () => {
      const ingredient = createIngredient({
        brand: createBrand({ id: 'brand_123', label: 'Test' }),
      });

      expect(ingredient.brandLogoUrl).toContain('placeholders/square.jpg');
    });
  });
});

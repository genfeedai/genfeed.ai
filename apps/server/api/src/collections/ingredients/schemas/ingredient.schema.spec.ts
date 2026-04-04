import {
  IngredientSchema,
  isProviderBackedPublicCatalogVoice,
} from '@api/collections/ingredients/schemas/ingredient.schema';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import mongoose, { type Model, type Types } from 'mongoose';

type IngredientValidationDocument = {
  brand?: Types.ObjectId;
  category: IngredientCategory;
  metadata: Types.ObjectId;
  organization?: Types.ObjectId;
  provider?: string;
  scope: AssetScope;
  status: IngredientStatus;
  user?: Types.ObjectId;
  voiceSource?: string;
};

describe('IngredientSchema', () => {
  const modelName = 'IngredientSchemaValidationTest';
  let IngredientModel: Model<IngredientValidationDocument>;

  beforeAll(() => {
    const schema = IngredientSchema.clone();
    schema.set('strict', false);

    if (mongoose.models[modelName]) {
      mongoose.deleteModel(modelName);
    }

    IngredientModel = mongoose.model<IngredientValidationDocument>(
      modelName,
      schema,
    );
  });

  afterAll(() => {
    if (mongoose.models[modelName]) {
      mongoose.deleteModel(modelName);
    }
  });

  it('should be defined', () => {
    expect(IngredientSchema).toBeDefined();
  });

  it('detects provider-backed public catalog voices', () => {
    expect(
      isProviderBackedPublicCatalogVoice({
        category: IngredientCategory.VOICE,
        provider: 'elevenlabs',
        scope: AssetScope.PUBLIC,
        voiceSource: 'catalog',
      }),
    ).toBe(true);

    expect(
      isProviderBackedPublicCatalogVoice({
        category: IngredientCategory.VOICE,
        scope: AssetScope.PUBLIC,
        voiceSource: 'catalog',
      }),
    ).toBe(false);
  });

  it('requires ownership for tenant-owned ingredients', async () => {
    const doc = new IngredientModel({
      category: IngredientCategory.IMAGE,
      metadata: new mongoose.Types.ObjectId(),
      scope: AssetScope.USER,
      status: IngredientStatus.DRAFT,
    });

    const error = await doc.validate().catch((validationError: unknown) => {
      return validationError as mongoose.Error.ValidationError;
    });

    expect(error.errors.user?.message).toContain(
      'provider-backed public catalog voice',
    );
    expect(error.errors.organization?.message).toContain(
      'provider-backed public catalog voice',
    );
    expect(error.errors.brand?.message).toContain(
      'provider-backed public catalog voice',
    );
  });

  it('allows ownerless provider-backed public catalog voices', async () => {
    const doc = new IngredientModel({
      category: IngredientCategory.VOICE,
      metadata: new mongoose.Types.ObjectId(),
      provider: 'elevenlabs',
      scope: AssetScope.PUBLIC,
      status: IngredientStatus.UPLOADED,
      voiceSource: 'catalog',
    });

    await expect(doc.validate()).resolves.toBeUndefined();
  });

  it('still requires ownership when catalog voice provider is missing', async () => {
    const doc = new IngredientModel({
      category: IngredientCategory.VOICE,
      metadata: new mongoose.Types.ObjectId(),
      scope: AssetScope.PUBLIC,
      status: IngredientStatus.UPLOADED,
      voiceSource: 'catalog',
    });

    const error = await doc.validate().catch((validationError: unknown) => {
      return validationError as mongoose.Error.ValidationError;
    });

    expect(error.errors.user?.message).toContain(
      'provider-backed public catalog voice',
    );
  });
});

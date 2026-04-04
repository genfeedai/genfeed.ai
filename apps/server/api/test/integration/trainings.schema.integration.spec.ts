import {
  Training,
  TrainingDocument,
  TrainingSchema,
} from '@api/collections/trainings/schemas/training.schema';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connection, Model, Types } from 'mongoose';

// Allow skipping this file when MongoDB memory server cannot run
// Set SKIP_MONGODB_MEMORY=true to skip all tests in this file
if (process.env.SKIP_MONGODB_MEMORY === 'true') {
  const g: any = global as any;
  const d: any = (global as any).describe;
  g.describe = ((name: string, fn: any) =>
    d?.skip ? d.skip(name, fn) : describe(name, fn)) as any;
  const i: any = (global as any).it;
  g.it = ((name: string, fn: any) =>
    i?.skip ? i.skip(name, fn) : it(name, fn)) as any;
  g.test = g.it;
}

describe('Training Schema (integration)', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let model: Model<TrainingDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongoUri),
        // Use the actual schema instance which already contains indexes
        MongooseModule.forFeature([
          { name: Training.name, schema: TrainingSchema },
        ]),
      ],
    }).compile();

    model = moduleRef.get<Model<TrainingDocument>>(
      getModelToken(Training.name),
    );

    // Ensure indexes are built so unique constraints are enforced
    await model.syncIndexes();
  });

  afterAll(async () => {
    await moduleRef.close();
    await connection.close();
    await mongod.stop();
  });

  const baseDoc = () => ({
    account: new Types.ObjectId(),
    destination: `model-${Date.now()}`,
    label: 'Unique Label',
    organization: new Types.ObjectId(),
    sources: [new Types.ObjectId()],
    steps: 1000,
    trigger: `TOK-${Date.now()}`,
    type: 'subject',
    user: new Types.ObjectId(),
  });

  it('sets provider default to replicate', async () => {
    const doc = await model.create(baseDoc());
    expect(doc.provider).toBe('replicate');
  });

  it('enforces label uniqueness per organization', async () => {
    const orgId = new Types.ObjectId();

    // First doc in org A
    await model.create({
      ...baseDoc(),
      label: 'My Model',
      organization: orgId,
    });

    // Duplicate label in same org should fail
    await expect(
      model.create({ ...baseDoc(), label: 'My Model', organization: orgId }),
    ).rejects.toMatchObject({ code: 11000 });

    // Same label in different org should succeed
    const other = await model.create({
      ...baseDoc(),
      label: 'My Model',
      organization: new Types.ObjectId(),
    });
    expect(other).toBeDefined();
    expect(String(other.organization)).not.toEqual(String(orgId));
  });
});

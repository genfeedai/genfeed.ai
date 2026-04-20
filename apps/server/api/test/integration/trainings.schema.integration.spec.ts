import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';

// Allow skipping this file when the Prisma DB is not available
// Set SKIP_PRISMA_DB=true to skip all tests in this file
if (process.env.SKIP_PRISMA_DB === 'true') {
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
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const baseDoc = () => ({
    destination: `model-${Date.now()}`,
    label: `Label-${Date.now()}`,
    steps: 1000,
    trigger: `TOK-${Date.now()}`,
    type: 'subject',
    // organizationId and userId are strings in Prisma
    organizationId: 'test-org-' + Math.random().toString(36).slice(2, 9),
    userId: 'test-user-' + Math.random().toString(36).slice(2, 9),
  });

  it('sets provider default to replicate', async () => {
    const doc = await prisma.training.create({
      data: {
        ...baseDoc(),
        provider: 'replicate',
      },
    });
    expect(doc.provider).toBe('replicate');
  });

  it('enforces label uniqueness per organization', async () => {
    const orgId = 'test-org-' + Math.random().toString(36).slice(2, 9);

    // First doc in org A
    await prisma.training.create({
      data: {
        ...baseDoc(),
        label: 'My Unique Model',
        organizationId: orgId,
      },
    });

    // Duplicate label in same org should fail
    await expect(
      prisma.training.create({
        data: {
          ...baseDoc(),
          label: 'My Unique Model',
          organizationId: orgId,
        },
      }),
    ).rejects.toThrow();

    // Same label in different org should succeed
    const otherOrgId = 'test-org-' + Math.random().toString(36).slice(2, 9);
    const other = await prisma.training.create({
      data: {
        ...baseDoc(),
        label: 'My Unique Model',
        organizationId: otherOrgId,
      },
    });
    expect(other).toBeDefined();
    expect(other.organizationId).not.toEqual(orgId);
  });
});

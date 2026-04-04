import { HealthController } from '@libs/health/health.controller';
import { HealthModule } from '@libs/health/health.module';
import { Test, type TestingModule } from '@nestjs/testing';

describe('HealthModule (library integration)', () => {
  let moduleRefRef: TestingModule | null = null;

  afterAll(async () => {
    if (moduleRefRef) {
      await moduleRefRef.close();
    }
  });

  it('registers the health controller', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();
    moduleRefRef = moduleRef;

    const controller = moduleRef.get(HealthController);

    expect(controller).toBeInstanceOf(HealthController);
    expect(controller.check()).toHaveProperty('status', 'ok');
  });
});

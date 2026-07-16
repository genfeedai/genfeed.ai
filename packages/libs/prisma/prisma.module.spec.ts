import { ConfigService } from '@libs/config/config.service';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Global, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

const configService = {
  get: vi.fn((key: string) =>
    key === 'DATABASE_URL'
      ? 'postgresql://user:pass@localhost:5432/genfeed'
      : undefined,
  ),
};

@Global()
@Module({
  exports: [ConfigService],
  providers: [{ provide: ConfigService, useValue: configService }],
})
class TestConfigModule {}

describe('PrismaModule', () => {
  let module: TestingModule | undefined;

  afterEach(async () => {
    await module?.close();
    vi.clearAllMocks();
  });

  it('creates PrismaService without treating constructor options as DI', async () => {
    module = await Test.createTestingModule({
      imports: [TestConfigModule, PrismaModule],
    }).compile();

    expect(module.get(PrismaService)).toBeInstanceOf(PrismaService);
    expect(configService.get).toHaveBeenCalledWith('DATABASE_URL');
  });
});

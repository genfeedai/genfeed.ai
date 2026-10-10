import { readFileSync } from 'node:fs';
import { BrandAccessModule } from '@api/authorization/brand-access/brand-access.module';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

describe('brand access leaf dependency graph', () => {
  it('resolves the real required service through Nest without collection cycles', async () => {
    const prisma = { member: {}, brand: {} };
    const module = await Test.createTestingModule({
      imports: [BrandAccessModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    expect(module.get(BrandAccessService)).toBeInstanceOf(BrandAccessService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BrandAccessModule),
    ).toContain(BrandAccessService);
    await module.close();
  });
  it('keeps authorization dependencies limited to Prisma, runtime config and existing role helpers', () => {
    for (const name of ['brand-access.module.ts', 'brand-access.service.ts']) {
      const source = readFileSync(new URL(name, import.meta.url), 'utf8');
      expect(source).not.toMatch(
        /forwardRef|@api\/(?:collections|agent-context|services\/agent|endpoints\/mcp)/,
      );
      expect(source).not.toMatch(/@Optional|ModuleRef/);
    }
  });
});

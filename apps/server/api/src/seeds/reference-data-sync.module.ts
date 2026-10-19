import { SkillsCoreModule } from '@api/collections/skills/skills-core.module';
import { FontFamilySeedService } from '@api/seeds/font-family-seed.service';
import { ModelCatalogSeedService } from '@api/seeds/model-catalog-seed.service';
import { PlatformTemplateSeedService } from '@api/seeds/platform-template-seed.service';
import { ReferenceDataSyncService } from '@api/seeds/reference-data-sync.service';
import { SkillCatalogSeedService } from '@api/seeds/skill-catalog-seed.service';
import { StudioElementSeedService } from '@api/seeds/studio-element-seed.service';
import { StudioPresetSeedService } from '@api/seeds/studio-preset-seed.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { ConfigModule } from '@libs/config/config.module';
import { ConfigService } from '@libs/config/config.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { RedisModule } from '@libs/redis/redis.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    PrismaModule,
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
    SkillsCoreModule,
  ],
  providers: [
    FontFamilySeedService,
    ModelCatalogSeedService,
    PlatformTemplateSeedService,
    ReferenceDataSyncService,
    SkillCatalogSeedService,
    StudioElementSeedService,
    StudioPresetSeedService,
  ],
})
export class ReferenceDataSyncModule {}

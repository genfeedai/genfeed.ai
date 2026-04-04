import { CreativePatternsController } from '@api/collections/creative-patterns/controllers/creative-patterns.controller';
import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import {
  CreativePattern,
  CreativePatternSchema,
} from '@api/collections/creative-patterns/schemas/creative-pattern.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [CreativePatternsController],
  exports: [CreativePatternsService, MongooseModule],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: CreativePattern.name,
          useFactory: () => {
            const schema = CreativePatternSchema;

            schema.index(
              { industry: 1, isDeleted: 1, platform: 1, scope: 1 },
              { name: 'pattern_lookup' },
            );

            schema.index(
              { patternType: 1, platform: 1 },
              { name: 'type_lookup' },
            );

            schema.index(
              { isDeleted: 1, organization: 1, scope: 1 },
              { name: 'org_private_lookup' },
            );

            schema.index(
              { validUntil: 1 },
              { expireAfterSeconds: 0, name: 'ttl_cleanup' },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [CreativePatternsService],
})
export class CreativePatternsModule {}

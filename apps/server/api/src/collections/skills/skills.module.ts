import { BrandsModule } from '@api/collections/brands/brands.module';
import { SkillsController } from '@api/collections/skills/controllers/skills.controller';
import {
  Skill,
  SkillSchema,
} from '@api/collections/skills/schemas/skill.schema';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ByokModule } from '@api/services/byok/byok.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [SkillsController],
  exports: [SkillsService, MongooseModule],
  imports: [
    forwardRef(() => BrandsModule),
    ByokModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: Skill.name,
          useFactory: () => {
            const schema = SkillSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { isDeleted: 1, organization: 1, slug: 1 },
              {
                partialFilterExpression: { isDeleted: false },
                unique: true,
              },
            );

            schema.index(
              { category: 1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [SkillsService],
})
export class SkillsModule {}

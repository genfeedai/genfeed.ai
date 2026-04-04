import { PersonasController } from '@api/collections/personas/controllers/personas.controller';
import { PersonasContentController } from '@api/collections/personas/controllers/personas-content.controller';
import {
  Persona,
  PersonaSchema,
} from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { PostsModule } from '@api/collections/posts/posts.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PersonaContentModule } from '@api/services/persona-content/persona-content.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [PersonasController, PersonasContentController],
  exports: [MongooseModule, PersonasService],
  imports: [
    forwardRef(() => PersonaContentModule),
    forwardRef(() => PostsModule),
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Persona.name,
          useFactory: () => {
            const schema = PersonaSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [PersonasService],
})
export class PersonasModule {}

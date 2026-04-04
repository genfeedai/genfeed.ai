/**
 * Roles Module
 * Permission system: define roles (admin, editor, viewer), manage capabilities,
and control feature access.
 */

import { RolesController } from '@api/collections/roles/controllers/roles.controller';
import { Role, RoleSchema } from '@api/collections/roles/schemas/role.schema';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [RolesController],
  exports: [RolesService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: Role.name,
          useFactory: () => {
            const schema = RoleSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AUTH,
    ),
  ],
  providers: [RolesService],
})
export class RolesModule {}

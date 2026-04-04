/**
 * Members Module
 * Organization membership: member invitations, role assignments,
and team collaboration features.
 */

import { MembersController } from '@api/collections/members/controllers/members.controller';
import {
  Member,
  MemberSchema,
} from '@api/collections/members/schemas/member.schema';
import { MembersService } from '@api/collections/members/services/members.service';
import { RolesModule } from '@api/collections/roles/roles.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ClerkModule } from '@api/services/integrations/clerk/clerk.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [MembersController],
  exports: [MongooseModule, MembersService],
  imports: [
    forwardRef(() => ClerkModule),
    forwardRef(() => RolesModule),
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Member.name,
          useFactory: () => {
            const schema = MemberSchema;

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
  providers: [MembersService],
})
export class MembersModule {}

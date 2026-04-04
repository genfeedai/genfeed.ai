/**
 * Users Module
 * User brand management: user profiles, authentication integration (Clerk),
 * user preferences, and activity tracking.
 */
import { BrandsModule } from '@api/collections/brands/brands.module';
import { MembersModule } from '@api/collections/members/members.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { SettingsModule } from '@api/collections/settings/settings.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { UsersController } from '@api/collections/users/controllers/users.controller';
import {
  User,
  type UserDocument,
  UserSchema,
} from '@api/collections/users/schemas/user.schema';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { UserSetupModule } from '@api/collections/users/user-setup.module';
import { CommonModule } from '@api/common/common.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ClerkModule } from '@api/services/integrations/clerk/clerk.module';
import { LoggerService } from '@libs/logger/logger.service';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { type CallbackWithoutResultAndOptionalError, Types } from 'mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

// Store reference to UserSetupService for use in schema hook
let userSetupServiceInstance: UserSetupService | null = null;
let loggerServiceInstance: LoggerService | null = null;

@Module({
  controllers: [UsersController],
  exports: [MongooseModule, UsersService],
  imports: [
    forwardRef(() => BrandsModule),
    forwardRef(() => ClerkModule),
    CommonModule,
    FilesClientModule,
    MembersModule,
    forwardRef(() => OrganizationsModule),
    forwardRef(() => SettingsModule),
    forwardRef(() => SubscriptionsModule),
    UserSetupModule,

    MongooseModule.forFeatureAsync(
      [
        {
          imports: [UserSetupModule],
          inject: [UserSetupService, LoggerService],
          name: User.name,
          useFactory: (
            userSetupService: UserSetupService,
            loggerService: LoggerService,
          ) => {
            // Store references for use in schema hook
            userSetupServiceInstance = userSetupService;
            loggerServiceInstance = loggerService;

            const schema = UserSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.virtual('settings', {
              foreignField: 'user',
              justOne: true,
              localField: '_id',
              ref: 'Setting',
            });

            // Add post-save hook that delegates to UserSetupService
            schema.post(
              'save',
              async (
                doc: UserDocument,
                next: CallbackWithoutResultAndOptionalError,
              ) => {
                // Skip organization creation if user is from an invitation
                if (doc.isInvited) {
                  return next();
                }

                const userId = new Types.ObjectId(doc._id);

                try {
                  if (!userSetupServiceInstance) {
                    throw new Error('UserSetupService not available');
                  }

                  await userSetupServiceInstance.initializeUserResources(
                    userId,
                  );
                  next();
                } catch (error: unknown) {
                  loggerServiceInstance?.error(
                    `User post-save hook failed for user ${userId}`,
                    { error: (error as Error)?.message },
                    'UsersModule.post-save',
                  );
                  throw error;
                }
              },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AUTH,
    ),
  ],
  providers: [UsersService],
})
export class UsersModule {}

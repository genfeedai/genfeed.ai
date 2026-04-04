/**
 * Tracked Links Module
 * Link tracking MVP: generate short links, track clicks, UTM parameters,
link performance analytics, and click attribution.
 */
import {
  RedirectController,
  TrackedLinksController,
} from '@api/collections/tracked-links/controllers/tracked-links.controller';
import {
  LinkClick,
  LinkClickSchema,
} from '@api/collections/tracked-links/schemas/link-click.schema';
import {
  TrackedLink,
  TrackedLinkSchema,
} from '@api/collections/tracked-links/schemas/tracked-link.schema';
import { TrackedLinksService } from '@api/collections/tracked-links/services/tracked-links.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [TrackedLinksController, RedirectController],
  exports: [MongooseModule, TrackedLinksService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: TrackedLink.name,
          useFactory: () => {
            const schema = TrackedLinkSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Indexes
            // CRITICAL SECURITY: shortCode must be globally unique across ALL organizations
            // because redirects resolve by shortCode without organization context.
            // Collisions would cause cross-organization data leaks and redirect hijacking.
            schema.index(
              { isDeleted: 1, shortCode: 1 },
              {
                partialFilterExpression: { isDeleted: false },
                unique: true,
              },
            );
            schema.index({ content: 1 });
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
        {
          name: LinkClick.name,
          useFactory: () => {
            const schema = LinkClickSchema;

            // Indexes
            schema.index({ linkId: 1, timestamp: -1 });
            schema.index({ linkId: 1, sessionId: 1 }); // For unique click detection

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [TrackedLinksService],
})
export class TrackedLinksModule {}

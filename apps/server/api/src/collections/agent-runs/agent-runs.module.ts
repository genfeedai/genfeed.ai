/**
 * Agent Runs Module
 * Tracks every agent execution as a first-class, queryable record.
 * Replaces embedded runHistory on AgentStrategy with org-scoped run documents.
 */
import { AgentRunsController } from '@api/collections/agent-runs/controllers/agent-runs.controller';
import { ThreadRunsController } from '@api/collections/agent-runs/controllers/thread-runs.controller';
import {
  AgentRun,
  AgentRunSchema,
} from '@api/collections/agent-runs/schemas/agent-run.schema';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import {
  Ingredient,
  IngredientSchema,
} from '@api/collections/ingredients/schemas/ingredient.schema';
import { Post, PostSchema } from '@api/collections/posts/schemas/post.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AgentThreadingModule } from '@api/services/agent-threading/agent-threading.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [AgentRunsController, ThreadRunsController],
  exports: [AgentRunsService, MongooseModule],
  imports: [
    AgentThreadingModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: AgentRun.name,
          useFactory: () => {
            const schema = AgentRunSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            // Mission Control queries: list runs by org, filter by status
            schema.index(
              { createdAt: -1, organization: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Per-strategy history
            schema.index(
              { createdAt: -1, organization: 1, strategy: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Subagent lookups (Phase 2)
            schema.index({ parentRun: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AGENT,
    ),
    // Cross-database models for getRunContent (attribution queries)
    MongooseModule.forFeature(
      [
        { name: Post.name, schema: PostSchema },
        { name: Ingredient.name, schema: IngredientSchema },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [AgentRunsService],
})
export class AgentRunsModule {}

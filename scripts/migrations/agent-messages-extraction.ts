/**
 * Agent Messages Extraction Migration
 *
 * Extracts embedded messages[] from agent.rooms documents into separate
 * agent.messages documents. This fixes the MongoDB anti-pattern of
 * unbounded embedded arrays (16MB BSON limit, full-doc rewrites on push).
 *
 * Features:
 * - Batched reads (100 rooms) and writes (1000 messages)
 * - Preserves original timestamps via createdAt override
 * - Count verification after migration
 * - Dry-run by default (pass --live to write)
 * - Does NOT remove messages from rooms (rollback safety)
 *
 * Post-migration (after deploy + verification):
 *   use agent;
 *   db.rooms.updateMany({}, { $unset: { messages: "" } });
 *
 * Usage:
 *   bun run scripts/migrations/agent-messages-extraction.ts                        # dry-run (default)
 *   bun run scripts/migrations/agent-messages-extraction.ts --live                 # actually write
 *   bun run scripts/migrations/agent-messages-extraction.ts --env=production       # dry-run production
 *   bun run scripts/migrations/agent-messages-extraction.ts --env=production --live
 */

import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { config } from 'dotenv';
import { type Db, type Document, MongoClient, type ObjectId } from 'mongodb';

const logger = new Logger('AgentMessagesExtraction');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const envArg = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
const envSuffix = envArg || 'local';
config({
  path: resolve(__dirname, `../../apps/server/api/.env.${envSuffix}`),
});

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error(`MONGODB_URI is required (loaded from .env.${envSuffix})`);
}

const DRY_RUN = !process.argv.includes('--live');
const ROOM_BATCH_SIZE = 100;
const MESSAGE_BATCH_SIZE = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmbeddedMessage {
  role: string;
  content?: string;
  toolCallId?: string;
  toolCalls?: Document[];
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

interface RoomDoc {
  _id: ObjectId;
  organization: ObjectId;
  user: string;
  messages?: EmbeddedMessage[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  logger.log('='.repeat(70));
  logger.log('Agent Messages Extraction Migration');
  logger.log('='.repeat(70));
  logger.log(`Environment: ${envSuffix}`);
  logger.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  logger.log('='.repeat(70));

  const client = new MongoClient(MONGODB_URI as string);
  await client.connect();
  logger.log('Connected to MongoDB\n');

  // Determine if we're using split DBs or single DB
  const agentDb = await resolveAgentDb(client);
  logger.log(`Using database: ${agentDb.databaseName}`);

  const roomsCol = agentDb.collection<RoomDoc>('rooms');
  const messagesCol = agentDb.collection('messages');

  // Check if messages collection already has data
  const existingCount = await messagesCol.countDocuments();
  if (existingCount > 0) {
    logger.warn(
      `messages collection already has ${existingCount} documents. Continuing will add more.`,
    );
  }

  // Count total rooms and embedded messages
  const totalRooms = await roomsCol.countDocuments();
  logger.log(`Total rooms: ${totalRooms}`);

  let totalEmbeddedMessages = 0;
  let totalExtracted = 0;
  let roomsProcessed = 0;
  let roomsWithMessages = 0;
  let skip = 0;

  while (skip < totalRooms) {
    const rooms = await roomsCol
      .find({})
      .skip(skip)
      .limit(ROOM_BATCH_SIZE)
      .toArray();

    if (rooms.length === 0) break;

    const messageBatch: Document[] = [];

    for (const room of rooms) {
      const messages = room.messages ?? [];
      if (messages.length === 0) {
        roomsProcessed++;
        continue;
      }

      roomsWithMessages++;
      totalEmbeddedMessages += messages.length;

      for (const msg of messages) {
        const messageDoc: Document = {
          content: msg.content,
          createdAt: msg.timestamp ?? new Date(),
          isDeleted: false,
          metadata: msg.metadata,
          organization: room.organization,
          role: msg.role,
          room: room._id,
          toolCallId: msg.toolCallId,
          toolCalls: msg.toolCalls ?? [],
          updatedAt: msg.timestamp ?? new Date(),
          user: String(room.user),
        };

        messageBatch.push(messageDoc);

        if (messageBatch.length >= MESSAGE_BATCH_SIZE) {
          if (!DRY_RUN) {
            await messagesCol.insertMany(messageBatch, { ordered: false });
          }
          totalExtracted += messageBatch.length;
          logger.log(
            `  ${DRY_RUN ? '[DRY RUN] ' : ''}Inserted ${totalExtracted} messages...`,
          );
          messageBatch.length = 0;
        }
      }

      roomsProcessed++;
    }

    // Flush remaining messages in batch
    if (messageBatch.length > 0) {
      if (!DRY_RUN) {
        await messagesCol.insertMany(messageBatch, { ordered: false });
      }
      totalExtracted += messageBatch.length;
      logger.log(
        `  ${DRY_RUN ? '[DRY RUN] ' : ''}Inserted ${totalExtracted} messages...`,
      );
    }

    skip += ROOM_BATCH_SIZE;
    logger.log(
      `Processed ${Math.min(skip, totalRooms)}/${totalRooms} rooms...`,
    );
  }

  // Verify counts
  logger.log(`\n${'='.repeat(70)}`);
  logger.log('VERIFICATION');
  logger.log('='.repeat(70));
  logger.log(`Rooms processed: ${roomsProcessed}`);
  logger.log(`Rooms with messages: ${roomsWithMessages}`);
  logger.log(`Total embedded messages found: ${totalEmbeddedMessages}`);
  logger.log(`Total messages extracted: ${totalExtracted}`);

  if (!DRY_RUN) {
    const finalCount = await messagesCol.countDocuments();
    logger.log(`Messages in collection: ${finalCount}`);

    const newMessages = finalCount - existingCount;
    if (newMessages === totalEmbeddedMessages) {
      logger.log('COUNT MATCH - Migration successful');
    } else {
      logger.error(
        `COUNT MISMATCH: expected ${totalEmbeddedMessages}, got ${newMessages} new documents`,
      );
    }
  }

  logger.log(`\n${'='.repeat(70)}`);
  logger.log('NEXT STEPS');
  logger.log('='.repeat(70));
  logger.log('1. Deploy the new code that reads from agent.messages');
  logger.log('2. Verify the app works correctly with the new collection');
  logger.log(
    '3. Run the following in Atlas to remove embedded messages from rooms:',
  );
  logger.log('   use agent;');
  logger.log('   db.rooms.updateMany({}, { $unset: { messages: "" } });');

  await client.close();
  logger.log('\nDone.');
}

/**
 * Determine the correct database. If the split migration has been done,
 * there's an 'agent' database. Otherwise, fall back to the default DB.
 */
async function resolveAgentDb(client: MongoClient): Promise<Db> {
  // Try the dedicated 'agent' DB first
  const agentDb = client.db('agent');
  const collections = await agentDb
    .listCollections({ name: 'rooms' })
    .toArray();
  if (collections.length > 0) {
    return agentDb;
  }

  // Fall back to the source DB from the connection URL
  const url = new URL(MONGODB_URI as string);
  const dbName = url.pathname.replace(/^\//, '') || 'genfeed';
  return client.db(dbName);
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});

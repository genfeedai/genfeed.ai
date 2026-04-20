import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import type { User } from '@clerk/backend';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { PushDesktopThreadsDto } from './dto/push-desktop-threads.dto';
import type { DesktopMessageDocument } from './schemas/desktop-message.schema';
import { DesktopMessage } from './schemas/desktop-message.schema';
import type { DesktopThreadDocument } from './schemas/desktop-thread.schema';
import { DesktopThread } from './schemas/desktop-thread.schema';

@Injectable()
export class DesktopSyncService {
  constructor(
    @InjectModel(DesktopThread.name)
    private readonly threadModel: Model<DesktopThreadDocument>,
    @InjectModel(DesktopMessage.name)
    private readonly messageModel: Model<DesktopMessageDocument>,
  ) {}

  @LogMethod()
  async pullThreads(user: User, cursor?: string) {
    const filter: Record<string, unknown> = { clerkUserId: user.id };
    if (cursor) {
      filter.updatedAt = { $gt: cursor };
    }

    const threads = await this.threadModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    const threadIds = threads.map((t) => t.id);
    const messages =
      threadIds.length > 0
        ? await this.messageModel
            .find({ threadId: { $in: threadIds } })
            .sort({ createdAt: 1 })
            .lean()
            .exec()
        : [];

    const msgsByThread = new Map<string, typeof messages>();
    for (const msg of messages) {
      const list = msgsByThread.get(msg.threadId) ?? [];
      list.push(msg);
      msgsByThread.set(msg.threadId, list);
    }

    const updatedCursor = new Date().toISOString();

    return {
      data: {
        threads: threads.map((t) => ({
          createdAt: t.createdAt,
          id: t.id,
          messages: (msgsByThread.get(t.id) ?? []).map((m) => ({
            content: m.content,
            createdAt: m.createdAt,
            draftId: m.draftId,
            generatedContent: m.generatedContent,
            id: m.id,
            role: m.role,
          })),
          status: t.status,
          title: t.title,
          updatedAt: t.updatedAt,
          workspaceId: t.workspaceId,
        })),
        updatedCursor,
      },
    };
  }

  @LogMethod()
  async pushThreads(user: User, dto: PushDesktopThreadsDto) {
    let accepted = 0;
    let rejected = 0;

    for (const thread of dto.threads) {
      try {
        const existing = await this.threadModel
          .findOne({ id: thread.id })
          .lean()
          .exec();

        if (!existing || thread.updatedAt > existing.updatedAt) {
          await this.threadModel.findOneAndUpdate(
            { id: thread.id },
            {
              $set: {
                clerkUserId: user.id,
                createdAt: thread.createdAt,
                id: thread.id,
                status: thread.status ?? 'idle',
                title: thread.title,
                updatedAt: thread.updatedAt,
                workspaceId: thread.workspaceId,
              },
            },
            { upsert: true },
          );

          for (const msg of thread.messages) {
            const existingMsg = await this.messageModel
              .findOne({ id: msg.id })
              .lean()
              .exec();

            if (!existingMsg) {
              await this.messageModel.create({
                content: msg.content,
                createdAt: msg.createdAt,
                draftId: msg.draftId,
                generatedContent: msg.generatedContent,
                id: msg.id,
                role: msg.role,
                threadId: thread.id,
              });
            }
          }
          accepted++;
        } else {
          rejected++;
        }
      } catch {
        rejected++;
      }
    }

    return {
      data: {
        accepted,
        rejected,
        updatedCursor: new Date().toISOString(),
      },
    };
  }
}

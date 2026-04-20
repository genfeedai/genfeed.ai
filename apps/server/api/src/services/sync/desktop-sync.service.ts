import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { User } from '@clerk/backend';
import { Injectable } from '@nestjs/common';
import type { PushDesktopThreadsDto } from './dto/push-desktop-threads.dto';

@Injectable()
export class DesktopSyncService {
  constructor(private readonly prisma: PrismaService) {}

  @LogMethod()
  async pullThreads(user: User, cursor?: string) {
    const threads = await this.prisma.desktopThread.findMany({
      include: { messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
      where: {
        clerkUserId: user.id,
        ...(cursor ? { updatedAt: { gt: new Date(cursor) } } : {}),
      },
    });

    const updatedCursor = new Date().toISOString();

    return {
      data: {
        threads: threads.map((t) => ({
          createdAt: t.createdAt,
          id: t.id,
          messages: t.messages.map((m) => ({
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
        const existing = await this.prisma.desktopThread.findUnique({
          select: { updatedAt: true },
          where: { id: thread.id },
        });

        if (!existing || thread.updatedAt > existing.updatedAt.toISOString()) {
          await this.prisma.desktopThread.upsert({
            create: {
              clerkUserId: user.id,
              createdAt: new Date(thread.createdAt),
              id: thread.id,
              status: thread.status ?? 'idle',
              title: thread.title,
              updatedAt: new Date(thread.updatedAt),
              workspaceId: thread.workspaceId,
            },
            update: {
              clerkUserId: user.id,
              createdAt: new Date(thread.createdAt),
              status: thread.status ?? 'idle',
              title: thread.title,
              updatedAt: new Date(thread.updatedAt),
              workspaceId: thread.workspaceId,
            },
            where: { id: thread.id },
          });

          if (thread.messages.length > 0) {
            await this.prisma.desktopMessage.createMany({
              data: thread.messages.map((msg) => ({
                content: msg.content,
                createdAt: new Date(msg.createdAt),
                draftId: msg.draftId,
                generatedContent: msg.generatedContent ?? undefined,
                id: msg.id,
                role: msg.role,
                threadId: thread.id,
              })),
              skipDuplicates: true,
            });
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

import type { AgentRoomDocument } from '@api/collections/agent-threads/schemas/agent-thread.schema';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentThreadKind, AgentThreadStatus } from '@genfeedai/contracts';
import { Injectable } from '@nestjs/common';

/** Title of the auto-created master thread. */
const MASTER_THREAD_TITLE = 'Master';

/**
 * The user's standing master thread (#8526): one per (organization, user),
 * created on first open. It is org-scoped (brand null) so it can start threads
 * in any brand.
 */
@Injectable()
export class AgentMasterThreadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentThreadsService: AgentThreadsService,
  ) {}

  /**
   * Concurrent first opens race on the partial unique index
   * `agent_threads_active_master_per_org_user_key`: the loser's insert is
   * rejected and it returns the winner's row, so exactly one master exists.
   */
  async getOrCreate(
    userId: string,
    organizationId: string,
  ): Promise<AgentRoomDocument> {
    const existing = await this.findMasterThread(userId, organizationId);
    if (existing) {
      return existing;
    }

    const mode = await this.agentThreadsService.resolveSavedMode(userId);
    try {
      const created = await this.prisma.agentThread.create({
        data: {
          kind: AgentThreadKind.MASTER,
          mode,
          organizationId,
          source: 'web',
          status: AgentThreadStatus.ACTIVE,
          title: MASTER_THREAD_TITLE,
          userId,
        },
      });
      const master = await this.agentThreadsService.findOne(
        scopedWhere(organizationId, { id: created.id }),
      );
      if (!master) {
        throw new Error(`Master thread ${created.id} vanished after create`);
      }
      return master;
    } catch (error: unknown) {
      if ((error as { code?: unknown } | null)?.code !== 'P2002') {
        throw error;
      }
      const winner = await this.findMasterThread(userId, organizationId);
      if (!winner) {
        throw error;
      }
      return winner;
    }
  }

  private findMasterThread(
    userId: string,
    organizationId: string,
  ): Promise<AgentRoomDocument | null> {
    return this.agentThreadsService.findOne(
      scopedWhere(organizationId, { kind: AgentThreadKind.MASTER, userId }),
    );
  }
}

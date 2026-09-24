import { randomBytes } from 'node:crypto';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { AgentReportAccessService } from '@api/services/agent-reports/agent-report-access.service';
import {
  type AgentReportReviewToken,
  agentReportBindings,
  agentReportTokenKey,
  reportRecord,
} from '@api/services/agent-reports/agent-report-binding';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { BatchItemStatus } from '@genfeedai/contracts';
import { IntegrationPlatform, IntegrationStatus } from '@genfeedai/prisma';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

export interface AgentReportDeliveryInput {
  organizationId: string;
  userId: string;
  channel: string;
  idempotencyKey: string;
  payload: unknown;
}
export type AgentReportDeliveryResult =
  | { status: 'delivered'; providerMessageId: string }
  | { status: 'skipped'; reason: string };
@Injectable()
export class AgentReportDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCryptoService,
    private readonly cache: CacheService,
    private readonly access: AgentReportAccessService,
    private readonly http: HttpService,
  ) {}
  async deliver(
    input: AgentReportDeliveryInput,
  ): Promise<AgentReportDeliveryResult> {
    if (input.channel !== 'telegram' && input.channel !== 'discord')
      return { status: 'skipped', reason: 'unsupported_agent_report_channel' };
    const payload = reportRecord(input.payload);
    if (
      typeof payload.strategyId !== 'string' ||
      typeof payload.summary !== 'string'
    )
      return { status: 'skipped', reason: 'agent_report_missing' };
    const strategy = await this.prisma.agentStrategy.findFirst({
      where: scopedWhere(input.organizationId, { id: payload.strategyId }),
      select: { id: true, brandId: true },
    });
    if (
      !strategy?.brandId ||
      !(await this.access.canReview(
        input.organizationId,
        input.userId,
        strategy.brandId,
      ))
    )
      return { status: 'skipped', reason: 'agent_report_access_revoked' };
    const integrations = await this.prisma.orgIntegration.findMany({
      where: scopedWhere(input.organizationId, {
        platform:
          input.channel === 'telegram'
            ? IntegrationPlatform.TELEGRAM
            : IntegrationPlatform.DISCORD,
        status: IntegrationStatus.ACTIVE,
      }),
    });
    const targets = integrations.flatMap((integration) =>
      agentReportBindings(integration.config)
        .filter(
          (binding) =>
            binding.brandId === strategy.brandId &&
            binding.userId === input.userId,
        )
        .map((binding) => ({ integration, binding })),
    );
    if (targets.length !== 1)
      return {
        status: 'skipped',
        reason: targets.length
          ? 'ambiguous_agent_report_binding'
          : 'agent_report_channel_not_opted_in',
      };
    const target = targets[0];
    if (!target)
      return { status: 'skipped', reason: 'agent_report_channel_not_opted_in' };
    const { integration, binding } = target;
    const posts =
      typeof payload.executionId === 'string'
        ? await this.prisma.post.findMany({
            where: scopedWhere(input.organizationId, {
              agentStrategyId: strategy.id,
              brandId: strategy.brandId,
              workflowExecutionId: payload.executionId,
              reviewDecision: null,
              targetExecutionState: 'draft',
            }),
            orderBy: { createdAt: 'asc' },
            take: 5,
            select: { id: true, updatedAt: true, label: true },
          })
        : [];
    const buttons: Array<{ token: string; label: string }> = [];
    for (const post of posts) {
      const item = await this.prisma.batchItem.findFirst({
        where: scopedWhere(input.organizationId, {
          brandId: strategy.brandId,
          reviewDecision: null,
          status: BatchItemStatus.COMPLETED,
          data: { path: ['postId'], equals: post.id },
        }),
        orderBy: { createdAt: 'desc' },
        select: { id: true, batchId: true },
      });
      if (!item) continue;
      const token = randomBytes(16).toString('hex');
      const receipt: AgentReportReviewToken = {
        organizationId: input.organizationId,
        integrationId: integration.id,
        platform: input.channel,
        binding,
        strategyId: strategy.id,
        batchId: item.batchId,
        itemId: item.id,
        postId: post.id,
        postVersion: post.updatedAt.toISOString(),
      };
      if (
        !(await this.cache.set(agentReportTokenKey(token), receipt, {
          ttl: 86400,
        }))
      )
        throw new Error('Agent report approval storage unavailable');
      buttons.push({ token, label: (post.label || 'Draft').slice(0, 45) });
    }
    const token = this.crypto.decrypt(integration.encryptedToken);
    const text =
      payload.summary.slice(0, 1600) +
      (posts.length
        ? '\nReview the drafts below. Approval follows the normal publishing review policy.'
        : '');
    try {
      if (input.channel === 'telegram') {
        const response = await firstValueFrom(
          this.http.post<{ ok: boolean; result?: { message_id: number } }>(
            `https://api.telegram.org/bot${token}/sendMessage`,
            {
              chat_id: binding.channelId,
              text,
              reply_markup: {
                inline_keyboard: buttons.map((button) => [
                  {
                    text: `Approve ${button.label}`,
                    callback_data: `agent-review:${button.token}:approve`,
                  },
                  {
                    text: 'Reject',
                    callback_data: `agent-review:${button.token}:reject`,
                  },
                ]),
              },
            },
            { timeout: 15000 },
          ),
        );
        if (!response.data.ok || !response.data.result)
          throw new Error('Provider rejected report');
        return {
          status: 'delivered',
          providerMessageId: String(response.data.result.message_id),
        };
      }
      const response = await firstValueFrom(
        this.http.post<{ id: string }>(
          `https://discord.com/api/v10/channels/${encodeURIComponent(binding.channelId)}/messages`,
          {
            content: text,
            allowed_mentions: { parse: [] },
            nonce: input.idempotencyKey.slice(-25),
            enforce_nonce: true,
            components: buttons.map((button) => ({
              type: 1,
              components: [
                {
                  type: 2,
                  style: 3,
                  label: `Approve ${button.label}`.slice(0, 80),
                  custom_id: `agent-review:${button.token}:approve`,
                },
                {
                  type: 2,
                  style: 4,
                  label: 'Reject',
                  custom_id: `agent-review:${button.token}:reject`,
                },
              ],
            })),
          },
          { headers: { Authorization: `Bot ${token}` }, timeout: 15000 },
        ),
      );
      if (!response.data.id) throw new Error('Provider rejected report');
      return { status: 'delivered', providerMessageId: response.data.id };
    } catch {
      throw new Error('Agent report provider request failed');
    }
  }
}

import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { getAgentTypeConfig } from '@api/services/agent-orchestrator/constants/agent-type-config.constant';
import type { AgentType } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';

export interface AgentProfileResolutionContext {
  agentType?: AgentType;
  campaignId?: string;
  strategyId?: string;
}

export interface ResolvedAgentProfileSnapshot {
  agentType?: string;
  campaign?: Types.ObjectId;
  enabledTools: string[];
  hooks: Record<string, unknown>;
  memoryPolicy: Record<string, unknown>;
  outputRules: Record<string, unknown>;
  promptFragments: string[];
  routeKey: string;
  strategy?: Types.ObjectId;
}

@Injectable()
export class AgentProfileResolverService {
  resolve(
    context: AgentProfileResolutionContext,
  ): ResolvedAgentProfileSnapshot {
    const typeConfig = context.agentType
      ? getAgentTypeConfig(context.agentType)
      : null;
    const campaignObjectId = ObjectIdUtil.normalizeToObjectId(
      context.campaignId,
    );
    const strategyObjectId = ObjectIdUtil.normalizeToObjectId(
      context.strategyId,
    );
    const routeKey = [
      context.agentType ?? 'general',
      campaignObjectId?.toString() ?? 'none',
      strategyObjectId?.toString() ?? 'none',
    ].join(':');

    return {
      agentType: context.agentType,
      campaign: campaignObjectId,
      enabledTools: [...(typeConfig?.defaultTools ?? [])],
      hooks: {
        after_tool_call: true,
        before_prompt_build: true,
        before_tool_call: true,
        session_end: true,
      },
      memoryPolicy: {
        autoFlushOnArchive: true,
        autoFlushOnBranch: true,
        autoFlushOnCompaction: true,
        autoFlushOnReset: true,
        scope: 'thread',
      },
      outputRules: {
        safeMarkdownOnly: true,
        separateWorkLog: true,
      },
      promptFragments: [
        'Persist work log, tool results, plans, and input requests as thread state.',
      ],
      routeKey,
      strategy: strategyObjectId,
    };
  }
}

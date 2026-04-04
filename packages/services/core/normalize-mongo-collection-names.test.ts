import { describe, expect, it } from 'vitest';
import { MANIFEST } from '../../../scripts/migrations/normalize-mongo-collection-names';

describe('normalize-mongo-collection-names manifest', () => {
  it('keeps the db/action matrix aligned with the current split-db model', () => {
    expect(serializeRenames(MANIFEST.cloud.rename)).toEqual(
      sortStrings([
        'batch_workflow_jobs->batch-workflow-jobs',
        'bot_activities->bot-activities',
        'brand_memory->brand-memory',
        'campaign_targets->campaign-targets',
        'content_performance->content-performance',
        'content_runs->content-runs',
        'content_skills->content-skills',
        'creative_patterns->creative-patterns',
        'livestream_bot_sessions->livestream-bot-sessions',
        'monitored_accounts->monitored-accounts',
        'orgintegrations->org-integrations',
        'outreach_campaigns->outreach-campaigns',
        'processed_tweets->processed-tweets',
        'reply_bot_configs->reply-bot-configs',
        'trendinghashtags->trending-hashtags',
        'trendingsounds->trending-sounds',
        'trendingvideos->trending-videos',
        'trendpreferences->trend-preferences',
      ]),
    );

    expect(serializeDrops(MANIFEST.cloud.dropEmptyStale)).toEqual(
      sortStrings([
        'agent-strategies',
        'organizations',
        'strategies',
        'tasks',
        'users',
      ]),
    );

    expect(serializeNoops(MANIFEST.cloud.noop)).toEqual(
      sortStrings(['outreach-campaigns', 'runs']),
    );

    expect(serializeRenames(MANIFEST.agent.rename)).toEqual(
      sortStrings([
        'agent_campaigns->agent-campaigns',
        'agent_goals->agent-goals',
        'agent_input_requests->agent-input-requests',
        'agent_memories->agent-memories',
        'agent_messages->agent-messages',
        'agent_profile_snapshots->agent-profile-snapshots',
        'agent_runs->agent-runs',
        'agent_session_bindings->agent-session-bindings',
        'agent_strategies->agent-strategies',
        'agent_strategy_opportunities->agent-strategy-opportunities',
        'agent_strategy_reports->agent-strategy-reports',
        'agent_thread_events->agent-thread-events',
        'agent_thread_snapshots->agent-thread-snapshots',
        'agent_threads->agent-threads',
        'campaigns->agent-campaigns',
        'goals->agent-goals',
        'messages->agent-messages',
        'memories->agent-memories',
        'profile_snapshots->agent-profile-snapshots',
        'requests->agent-input-requests',
        'rooms->agent-threads',
        'runs->agent-runs',
        'session_bindings->agent-session-bindings',
        'strategies->agent-strategies',
        'strategy_opportunities->agent-strategy-opportunities',
        'strategy_reports->agent-strategy-reports',
        'thread_events->agent-thread-events',
        'thread_snapshots->agent-thread-snapshots',
      ]),
    );

    expect(MANIFEST.agent.dropEmptyStale).toEqual([]);
    expect(MANIFEST.agent.noop).toEqual([]);

    expect(MANIFEST.auth.rename).toEqual([]);
    expect(MANIFEST.auth.dropEmptyStale).toEqual([]);
    expect(serializeNoops(MANIFEST.auth.noop)).toEqual(
      sortStrings([
        'api-keys',
        'members',
        'organization-settings',
        'organizations',
        'profiles',
        'roles',
        'settings',
        'user-subscriptions',
        'users',
      ]),
    );

    expect(MANIFEST.crm.dropEmptyStale).toEqual([]);
    expect(MANIFEST.crm.noop).toEqual([]);
    expect(MANIFEST.crm.rename).toEqual([{ from: 'tasks', to: 'crm-tasks' }]);
  });
});

function serializeRenames(
  plans: Array<{ from: string; to: string }>,
): string[] {
  return plans.map((plan) => `${plan.from}->${plan.to}`).sort();
}

function serializeDrops(plans: Array<{ collection: string }>): string[] {
  return plans.map((plan) => plan.collection).sort();
}

function serializeNoops(plans: Array<{ collection: string }>): string[] {
  return plans.map((plan) => plan.collection).sort();
}

function sortStrings(values: string[]): string[] {
  return [...values].sort();
}

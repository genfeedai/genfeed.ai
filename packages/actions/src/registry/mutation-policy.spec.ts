import { describe, expect, it } from 'vitest';
import { getActionDefinition } from './action-registry';
import { CURATED_ACTION_CATALOG } from './curated-action-catalog';
import {
  buildLogicalWriteKey,
  evaluateMutationPolicy,
  getDeclaredMutationPolicy,
  isApprovalRequiredToolName,
  MUTATION_POLICY_BY_NAME,
  POLICY_REVOKED_ERROR,
  toolRequiresMutationPolicy,
  UNSUPPORTED_APPROVAL_ERROR,
} from './mutation-policy';
import { ALL_TOOLS, getToolByName } from './tool-registry';

const MCP_QUEUED_WRITES = [
  'analyze_clip_project',
  'approve_social_draft',
  'control_scheduled_release',
  'create_ad_remix_workflow',
  'create_article',
  'create_clip_project_from_youtube',
  'create_instagram_remix_workflow',
  'create_post',
  'create_scheduled_release',
  'generate_clips',
  'generate_content_batch',
  'install_skills_pro_skill',
  'post_social_reply',
  'send_social_dm',
  'skip_brand_interview_question',
  'start_brand_interview',
  'submit_brand_interview_answer',
  'update_scheduled_release',
] as const;

describe('mutation policy map', () => {
  it('declares a policy for every canonical write tool', () => {
    const missing = ALL_TOOLS.filter(
      (tool) =>
        toolRequiresMutationPolicy(tool.name) &&
        getDeclaredMutationPolicy(tool.name) === undefined,
    ).map((tool) => tool.name);
    expect(missing).toEqual([]);
  });

  it('does not declare a policy for read-only tools', () => {
    const extras = ALL_TOOLS.filter(
      (tool) =>
        !toolRequiresMutationPolicy(tool.name) &&
        getDeclaredMutationPolicy(tool.name) !== undefined,
    ).map((tool) => tool.name);
    expect(extras).toEqual([]);
  });

  it('only names cataloged actions', () => {
    const catalogNames = new Set(
      CURATED_ACTION_CATALOG.map((entry) => entry.name),
    );
    const unknown = Object.keys(MUTATION_POLICY_BY_NAME).filter(
      (name) => !catalogNames.has(name),
    );
    expect(unknown).toEqual([]);
  });

  it('stamps the declared policy onto canonical write tools', () => {
    for (const [name, policy] of Object.entries(MUTATION_POLICY_BY_NAME)) {
      expect(getToolByName(name)?.mutationPolicy, name).toBe(policy);
    }
    expect(
      getToolByName('get_credits_balance')?.mutationPolicy,
    ).toBeUndefined();
    expect(getToolByName('resolve_approval')?.mutationPolicy).toBeUndefined();
    expect(getActionDefinition('create_post')?.approval).toBe('required');
    expect(getActionDefinition('generate_image')?.approval).toBe('none');
  });

  it('keeps the MCP queued write set approval-required', () => {
    for (const name of MCP_QUEUED_WRITES) {
      expect(isApprovalRequiredToolName(name), name).toBe(true);
      expect(getToolByName(name)?.mutationPolicy, name).toBe(
        'approval-required',
      );
    }
  });
});

describe('evaluateMutationPolicy', () => {
  it('executes direct mutations without an approval host', () => {
    expect(
      evaluateMutationPolicy({
        hasTrustedApproval: false,
        hostSupportsApproval: false,
        isAvailableOnSurface: true,
        policy: 'direct',
      }),
    ).toEqual({ kind: 'execute' });
  });

  it('queues approval-required calls on a host that can approve', () => {
    expect(
      evaluateMutationPolicy({
        hasTrustedApproval: false,
        hostSupportsApproval: true,
        isAvailableOnSurface: true,
        policy: 'approval-required',
      }),
    ).toEqual({ kind: 'queue' });
  });

  it('rejects approval-required calls when the host cannot approve', () => {
    expect(
      evaluateMutationPolicy({
        hasTrustedApproval: false,
        hostSupportsApproval: false,
        isAvailableOnSurface: true,
        policy: 'approval-required',
      }),
    ).toEqual({ error: UNSUPPORTED_APPROVAL_ERROR, kind: 'reject' });
  });

  it('executes after an explicit trusted approval', () => {
    expect(
      evaluateMutationPolicy({
        hasTrustedApproval: true,
        hostSupportsApproval: true,
        isAvailableOnSurface: true,
        policy: 'approval-required',
      }),
    ).toEqual({ kind: 'execute' });
  });

  it('replays an already-executed approved logical write', () => {
    expect(
      evaluateMutationPolicy({
        existing: { result: { id: 'post-1' }, status: 'APPROVED' },
        hasTrustedApproval: true,
        hostSupportsApproval: true,
        isAvailableOnSurface: true,
        policy: 'approval-required',
      }),
    ).toEqual({ kind: 'replay', result: { id: 'post-1' } });
  });

  it('refreshes availability before a subsequent call executes', () => {
    expect(
      evaluateMutationPolicy({
        hasTrustedApproval: true,
        hostSupportsApproval: true,
        isAvailableOnSurface: false,
        policy: 'approval-required',
      }),
    ).toEqual({ error: POLICY_REVOKED_ERROR, kind: 'reject' });
  });

  it('executes when policy is no longer approval-required', () => {
    expect(
      evaluateMutationPolicy({
        hasTrustedApproval: false,
        hostSupportsApproval: true,
        isAvailableOnSurface: true,
        policy: 'direct',
      }),
    ).toEqual({ kind: 'execute' });
  });
});

describe('buildLogicalWriteKey', () => {
  it('is stable across key order and distinct across arguments', () => {
    const base = {
      organizationId: 'org-1',
      threadId: 'thread-1',
      toolName: 'create_post',
      userId: 'user-1',
    };
    expect(
      buildLogicalWriteKey({
        ...base,
        arguments: { b: 2, a: 1 },
      }),
    ).toBe(
      buildLogicalWriteKey({
        ...base,
        arguments: { a: 1, b: 2 },
      }),
    );
    expect(
      buildLogicalWriteKey({
        ...base,
        arguments: { a: 1 },
      }),
    ).not.toBe(
      buildLogicalWriteKey({
        ...base,
        arguments: { a: 2 },
      }),
    );
  });
});

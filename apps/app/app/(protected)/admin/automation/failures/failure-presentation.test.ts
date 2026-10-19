import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  buildFailureClipboardText,
  buildFailureIssueUrl,
  summarizeFailureError,
} from './failure-presentation';

const run = {
  completedAt: '2026-10-17T09:21:09Z',
  createdAt: '2026-10-17T09:20:00Z',
  error:
    'Nodes failed: infer-turn: Agent exceeded maximum tool-calling rounds (25)',
  failureReason: 'UNKNOWN',
  id: 'run-1',
  organization: { id: 'org-1', label: 'Acme' },
  organizationId: 'org-1',
  workflow: { id: 'wf-1', label: 'Execute Agent Turn' },
  workflowId: 'wf-1',
} as IWorkflowExecution;

describe('summarizeFailureError', () => {
  it('strips node plumbing prefixes', () => {
    expect(summarizeFailureError(run.error)).toBe(
      'Agent exceeded maximum tool-calling rounds (25)',
    );
    expect(
      summarizeFailureError(
        'Nodes failed: prepare-turn: request.threadId is required',
      ),
    ).toBe('request.threadId is required');
  });

  it('collapses nested node prefixes and contract violations', () => {
    expect(
      summarizeFailureError(
        'Nodes failed: infer-turn: Nodes failed: execute-tool: Action contract output validation failed [action=generate_content_batch workflow=w version=v run=r node=n] $.approvalId: must NOT have additional properties; $.approvalStatus: must NOT have additional properties',
      ),
    ).toBe(
      'Action contract output validation failed for generate_content_batch (2 schema violations)',
    );
  });

  it('truncates long single-line errors and handles empty input', () => {
    expect(summarizeFailureError('x'.repeat(400))).toHaveLength(140);
    expect(summarizeFailureError(undefined)).toBe('');
  });
});

describe('buildFailureIssueUrl', () => {
  it('prefills a new issue on genfeedai/genfeed.ai with run, org, workflow and error', () => {
    const url = new URL(buildFailureIssueUrl(run, 'Agent exceeded rounds'));
    expect(url.origin + url.pathname).toBe(
      'https://github.com/genfeedai/genfeed.ai/issues/new',
    );
    expect(url.searchParams.get('title')).toBe(
      'Agent run failed: Agent exceeded rounds',
    );
    const body = url.searchParams.get('body') ?? '';
    expect(body).toContain('`run-1`');
    expect(body).toContain('Acme (org-1)');
    expect(body).toContain('Execute Agent Turn');
    expect(body).toContain(run.error as string);
  });

  it('caps the error so the URL stays openable', () => {
    const url = buildFailureIssueUrl(
      { ...run, error: 'e'.repeat(20_000) },
      'summary',
    );
    expect(url.length).toBeLessThan(8000);
  });
});

describe('buildFailureClipboardText', () => {
  it('falls back to ids when names are missing', () => {
    const text = buildFailureClipboardText({
      ...run,
      organization: undefined,
      workflow: undefined,
    });
    expect(text).toContain('Organization: org-1');
    expect(text).toContain('Workflow: wf-1');
  });
});

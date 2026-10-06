import { MutationApprovalCard } from '@genfeedai/agent/components/MutationApprovalCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import messages from '../../../../apps/app/messages/en/agent.json';
import '../../tests/fixtures/mutation-approval.browser.css';

beforeEach(() => {
  document.documentElement.dataset.theme = 'dark';
});

vi.mock('@genfeedai/helpers', async () => {
  const { cn } = await import('@genfeedai/helpers/formatting/cn/cn.util');
  return { cn };
});

it('lets a user review the prepared intent and decline in Chromium', async () => {
  const action: AgentUiAction = {
    id: 'card-1',
    type: 'mutation_approval_card',
    data: {
      approvalId: 'approval-1',
      sourceActionId: 'source-1',
      summary: 'Delete the Summer launch draft?',
      items: [
        { label: 'Draft', value: 'Summer launch' },
        { label: 'Brand', value: 'Acme' },
      ],
      status: 'pending',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  };
  const onUiAction = vi.fn().mockResolvedValue(true);
  await render(
    <NextIntlClientProvider locale="en" messages={{ agent: messages }}>
      <MutationApprovalCard action={action} onUiAction={onUiAction} />
    </NextIntlClientProvider>,
  );
  await expect
    .element(page.getByText('Summer launch', { exact: true }))
    .toBeVisible();
  await page.screenshot({ path: 'mutation-approval-pending.png' });
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect.element(page.getByRole('status')).toHaveTextContent('Declined');
  expect(onUiAction).toHaveBeenCalledWith('decline_mutation', {
    approvalId: 'approval-1',
    sourceActionId: 'source-1',
  });
  await page.screenshot({ path: 'mutation-approval-declined.png' });
});

it('shows contextual expiry and sends only a renewal request in Chromium', async () => {
  const onUiAction = vi.fn().mockResolvedValue(false);
  const action: AgentUiAction = {
    id: 'mutation-approval:expired-1',
    type: 'mutation_approval_card',
    title: 'Review action',
    data: {
      approvalId: 'expired-1',
      sourceActionId: 'mutation-approval:expired-1',
      summary: 'Save brand voice',
      items: [{ label: 'Style', value: 'Direct and practical' }],
      status: 'pending',
      expiresAt: new Date(0).toISOString(),
    },
  };
  await render(
    <NextIntlClientProvider locale="en" messages={{ agent: messages }}>
      <MutationApprovalCard action={action} onUiAction={onUiAction} />
    </NextIntlClientProvider>,
  );
  await expect
    .element(page.getByText('Approval expired', { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Approve', exact: true }))
    .not.toBeInTheDocument();
  await page.screenshot({ path: 'mutation-approval-expired.png' });
  await page.getByRole('button', { name: 'Prepare again' }).click();
  await expect
    .element(
      page.getByText(messages.mutationApproval.prepareFailed, { exact: true }),
    )
    .toBeVisible();
  expect(onUiAction).toHaveBeenCalledWith('reprepare_mutation', {
    approvalId: 'expired-1',
    sourceActionId: 'mutation-approval:expired-1',
  });
});

it('shows a red failure with collapsed details and review recovery in Chromium', async () => {
  const action: AgentUiAction = {
    id: 'mutation-approval:failed-1',
    type: 'mutation_approval_card',
    title: 'Review action',
    data: {
      approvalId: 'failed-1',
      sourceActionId: 'mutation-approval:failed-1',
      summary: 'Save brand voice',
      items: [{ label: 'Style', value: 'Direct and practical' }],
      status: 'approved',
      executionStatus: 'failed',
      error: 'Dispatch failed',
    },
  };
  await render(
    <NextIntlClientProvider locale="en" messages={{ agent: messages }}>
      <MutationApprovalCard
        action={action}
        onUiAction={vi.fn().mockResolvedValue(true)}
      />
    </NextIntlClientProvider>,
  );
  await expect
    .element(page.getByText('Action failed', { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText('Dispatch failed', { exact: true }))
    .not.toBeInTheDocument();
  const surface = document.querySelector('[aria-busy]');
  expect(surface).not.toBeNull();
  if (surface) {
    expect(parseFloat(getComputedStyle(surface).borderRadius)).toBeGreaterThan(
      0,
    );
    expect(getComputedStyle(surface).boxShadow).toBe('none');
  }
  await page.screenshot({ path: 'mutation-approval-failed.png' });
  await page.getByRole('button', { name: 'Technical details' }).click();
  await expect
    .element(page.getByText('Dispatch failed', { exact: true }))
    .toBeVisible();
  await page.getByRole('button', { name: 'Review changes' }).click();
  await expect.element(page.getByText('Review requested')).toBeVisible();
});

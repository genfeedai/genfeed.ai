import { MutationApprovalCard } from '@genfeedai/agent/components/MutationApprovalCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { page } from '@vitest/browser/context';
import { NextIntlClientProvider } from 'next-intl';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import messages from '../../../../apps/app/messages/en/agent.json';

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

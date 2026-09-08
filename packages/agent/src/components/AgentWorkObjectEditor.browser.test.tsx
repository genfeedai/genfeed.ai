import { AgentWorkObjectEditor } from '@genfeedai/agent/components/AgentWorkObjectEditor';
import type {
  AgentWorkObject,
  AgentWorkObjectActionPayload,
} from '@genfeedai/contracts/interfaces';
import { NextIntlClientProvider } from 'next-intl';
import { type ComponentProps, useState } from 'react';
import { expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import messages from '../../../../apps/app/messages/en/agent.json';

vi.mock('next/link', () => ({
  __esModule: true,
  default: function BrowserLink(props: ComponentProps<'a'>) {
    return <a {...props} />;
  },
}));

vi.mock('@genfeedai/helpers', async () => {
  const { cn } = await import('@genfeedai/helpers/formatting/cn/cn.util');
  return { cn };
});

const onAction = vi.fn();
const initialObject: AgentWorkObject = {
  id: 'script-1',
  kind: 'table',
  title: 'Shooting script',
  revision: 1,
  columns: [
    { key: 'shot', label: 'Shot' },
    { key: 'script', label: 'Script' },
  ],
  rows: [{ shot: 'Opening', script: 'Welcome' }],
  rowCount: 1,
  viewedInSession: false,
  reviewStatus: 'pending',
  href: '/library/videos?asset=script-1',
  reference: {
    kind: 'ingredient',
    serializer: 'ingredient',
    recordId: 'script-1',
    organizationId: 'org-1',
  },
};

function WorkObjectHarness() {
  const [object, setObject] = useState(initialObject);
  async function handleAction(
    current: AgentWorkObject,
    action: AgentWorkObjectActionPayload['action'],
    changes?: Pick<AgentWorkObjectActionPayload, 'body' | 'rows'>,
  ) {
    onAction(current, action, changes);
    setObject((previous) => ({
      ...previous,
      ...(action === 'view' ? { viewedInSession: true } : {}),
      ...(action === 'edit'
        ? {
            ...changes,
            revision: previous.revision + 1,
            viewedInSession: false,
            reviewStatus: 'pending' as const,
          }
        : {}),
      ...(action === 'review' ? { reviewStatus: 'reviewing' as const } : {}),
      ...(action === 'cancel' ? { reviewStatus: 'failed' as const } : {}),
      ...(action === 'skip' ? { reviewStatus: 'skipped' as const } : {}),
    }));
  }
  return (
    <NextIntlClientProvider locale="en" messages={{ agent: messages }}>
      <div style={{ paddingTop: 1500 }}>
        <AgentWorkObjectEditor object={object} onAction={handleAction} />
      </div>
    </NextIntlClientProvider>
  );
}

it('requires actual viewport exposure, saves rows and supports review, Stop and explicit skip by keyboard in Chromium', async () => {
  await render(<WorkObjectHarness />);
  await expect
    .element(page.getByRole('button', { name: 'Review the draft' }))
    .toBeDisabled();
  expect(onAction).not.toHaveBeenCalled();
  await page.getByRole('textbox', { name: 'Script, row 1' }).click();
  await expect
    .element(page.getByRole('button', { name: 'Review the draft' }))
    .toBeEnabled();
  expect(onAction).toHaveBeenCalledWith(
    expect.objectContaining({ viewedInSession: false }),
    'view',
    undefined,
  );
  await page
    .getByRole('textbox', { name: 'Script, row 1' })
    .fill('Revised opening for the source clip');
  await expect
    .element(page.getByRole('button', { name: 'Review the draft' }))
    .toBeDisabled();
  await userEvent.keyboard('{Tab}');
  await userEvent.keyboard('{Enter}');
  await expect
    .element(page.getByRole('status'))
    .toHaveTextContent('Saved to Library');
  expect(onAction).toHaveBeenCalledWith(
    expect.objectContaining({ revision: 1 }),
    'edit',
    {
      body: '',
      rows: [
        { shot: 'Opening', script: 'Revised opening for the source clip' },
      ],
    },
  );
  await expect
    .element(page.getByRole('button', { name: 'Review the draft' }))
    .toBeEnabled();
  await page.getByRole('button', { name: 'Review the draft' }).click();
  await expect
    .element(page.getByRole('status'))
    .toHaveTextContent('Reviewing the draft…');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  expect(onAction).toHaveBeenCalledWith(
    expect.objectContaining({ reviewStatus: 'reviewing' }),
    'cancel',
    undefined,
  );
  await page.getByRole('button', { name: 'Skip review' }).click();
  await expect
    .element(page.getByRole('status'))
    .toHaveTextContent('Review skipped');
  await expect
    .element(
      page.getByText('Ready. Generate still requires your confirmation.'),
    )
    .toBeVisible();
  await page.screenshot({
    path: '../../dist/vitest/screenshots/work-object-reviewed.png',
    element:
      document.querySelector('[data-work-object-id="script-1"]') ?? undefined,
  });
});

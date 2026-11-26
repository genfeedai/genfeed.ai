import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';

/** The workflows copy lives in the host app's message catalog; tests read it as data. */
const workflowMessages: Record<string, unknown> = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      '../../../../../apps/web/messages/en/pages/workflows.json',
    ),
    'utf8',
  ),
);

/** Renders with the real English copy, so a test reads what a person reads. */
export function renderWithMessages(ui: ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ pages: { workflows: workflowMessages } }}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

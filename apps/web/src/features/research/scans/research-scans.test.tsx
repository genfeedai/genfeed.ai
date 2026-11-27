import type { ResearchScanStatus } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import pages from '../../../../messages/en/pages';
import ResearchScanBadge from './ResearchScanBadge';
import ResearchScanButton from './ResearchScanButton';
import ResearchScanLimitAlert from './ResearchScanLimitAlert';
import '@testing-library/jest-dom/vitest';

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => `/acme${path}` }),
}));

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function withIntl(children: ReactNode) {
  return (
    <NextIntlClientProvider
      locale="en"
      messages={{ pages } as never}
      timeZone="UTC"
    >
      {children}
    </NextIntlClientProvider>
  );
}

function status(overrides: Partial<ResearchScanStatus>): ResearchScanStatus {
  return {
    hasPlan: false,
    library: 'trends',
    limit: { maxScans: 1, windowMs: 7 * DAY_MS },
    nextAvailableAt: null,
    remaining: 1,
    used: 0,
    ...overrides,
  };
}

describe('ResearchScanBadge', () => {
  it('counts a weekly library in scans this week', () => {
    render(withIntl(<ResearchScanBadge status={status({})} />));

    expect(screen.getByTestId('research-scan-badge')).toHaveTextContent(
      '1 of 1 scan left this week',
    );
  });

  it('counts a daily library in scans today', () => {
    render(
      withIntl(
        <ResearchScanBadge
          status={status({
            hasPlan: true,
            limit: { maxScans: 5, windowMs: DAY_MS },
            remaining: 3,
            used: 2,
          })}
        />,
      ),
    );

    expect(screen.getByTestId('research-scan-badge')).toHaveTextContent(
      '3 of 5 scans left today',
    );
  });

  it('says unlimited when the library has no limit', () => {
    render(
      withIntl(
        <ResearchScanBadge
          status={status({ hasPlan: true, limit: null, remaining: null })}
        />,
      ),
    );

    expect(screen.getByTestId('research-scan-badge')).toHaveTextContent(
      'Unlimited scans',
    );
  });

  it('shows nothing until the counts load', () => {
    const { container } = render(
      withIntl(<ResearchScanBadge status={undefined} />),
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe('ResearchScanLimitAlert', () => {
  it('shows nothing while a scan is left', () => {
    const { container } = render(
      withIntl(<ResearchScanLimitAlert status={status({})} />),
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('tells a no-plan organization when the next scan opens and links to plans', () => {
    render(
      withIntl(
        <ResearchScanLimitAlert
          status={status({
            nextAvailableAt: new Date(Date.now() + 3 * DAY_MS).toISOString(),
            remaining: 0,
            used: 1,
          })}
        />,
      ),
    );

    const alert = screen.getByTestId('research-scan-limit');
    expect(alert).toHaveTextContent("You have used this week's scan");
    expect(alert).toHaveTextContent('Your next scan opens');
    expect(alert).toHaveTextContent('Pro gives you 5 scans a day.');
    expect(screen.getByRole('link', { name: 'See plans' })).toHaveAttribute(
      'href',
      '/acme/settings/subscription',
    );
  });

  it('gives a plan organization the time and no plan pitch', () => {
    render(
      withIntl(
        <ResearchScanLimitAlert
          status={status({
            hasPlan: true,
            limit: { maxScans: 5, windowMs: DAY_MS },
            nextAvailableAt: new Date(Date.now() + 2 * HOUR_MS).toISOString(),
            remaining: 0,
            used: 5,
          })}
        />,
      ),
    );

    const alert = screen.getByTestId('research-scan-limit');
    expect(alert).toHaveTextContent("You have used today's scans");
    expect(alert).not.toHaveTextContent('Pro gives you');
    expect(screen.queryByRole('link', { name: 'See plans' })).toBeNull();
  });
});

describe('ResearchScanButton', () => {
  it('starts a scan when one is left', () => {
    const onScan = vi.fn();
    render(
      withIntl(
        <ResearchScanButton
          isScanning={false}
          onScan={onScan}
          status={status({})}
        />,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Scan niche' }));

    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it('is off when no scans are left', () => {
    const onScan = vi.fn();
    render(
      withIntl(
        <ResearchScanButton
          isScanning={false}
          onScan={onScan}
          status={status({
            nextAvailableAt: new Date(Date.now() + DAY_MS).toISOString(),
            remaining: 0,
          })}
        />,
      ),
    );

    const button = screen.getByRole('button', { name: 'Scan niche' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('is off while a scan runs', () => {
    render(
      withIntl(
        <ResearchScanButton isScanning onScan={vi.fn()} status={status({})} />,
      ),
    );

    expect(screen.getByRole('button', { name: /Scanning/ })).toBeDisabled();
  });
});

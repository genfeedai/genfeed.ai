import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { captureWebsiteAnalyticsEvent } from '../../../../packages/analytics/posthog-client';
import ArticleResource from './article-resource';
import { copyText } from './copy-text';

vi.mock('./copy-text', () => ({ copyText: vi.fn() }));
vi.mock('../../../../packages/analytics/posthog-client', () => ({
  captureWebsiteAnalyticsEvent: vi.fn(),
}));
const resource = {
  skill: 'cinematic-prompting',
  label: 'Build your visual brief',
};
beforeEach(() => {
  vi.clearAllMocks();
});

it('copies a verified focused install command and records the successful resource action', async () => {
  vi.mocked(copyText).mockResolvedValue(true);
  render(<ArticleResource slug="tested-guide" resource={resource} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copy install command' }));
  });
  expect(copyText).toHaveBeenCalledWith(
    'bunx skills add genfeedai/skills --skill cinematic-prompting',
  );
  expect(captureWebsiteAnalyticsEvent).toHaveBeenCalledWith(
    'article_cta_clicked',
    {
      articleSlug: 'tested-guide',
      skillSlug: 'cinematic-prompting',
      action: 'copy_install',
    },
  );
  expect(
    screen.getByRole('button', { name: 'Copied install command' }),
  ).toBeInTheDocument();
});

it('does not report an install-command action when clipboard copying fails', async () => {
  vi.mocked(copyText).mockResolvedValue(false);
  render(<ArticleResource slug="tested-guide" resource={resource} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copy install command' }));
  });
  expect(captureWebsiteAnalyticsEvent).not.toHaveBeenCalled();
});

it('links to the public MCP setup page and records the resource action', () => {
  render(<ArticleResource slug="tested-guide" resource={resource} />);
  const link = screen.getByRole('link', { name: 'Connect through MCP' });
  expect(link).toHaveAttribute('href', 'https://mcp.genfeed.ai');
  link.addEventListener('click', (event) => event.preventDefault());
  fireEvent.click(link);
  expect(captureWebsiteAnalyticsEvent).toHaveBeenCalledWith(
    'article_cta_clicked',
    {
      articleSlug: 'tested-guide',
      skillSlug: 'cinematic-prompting',
      action: 'mcp',
    },
  );
});

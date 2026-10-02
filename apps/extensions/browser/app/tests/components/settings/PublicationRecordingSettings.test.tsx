import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PublicationRecordingSettings } from '~components/settings/PublicationRecordingSettings';
import { useSettingsStore } from '~store/use-settings-store';
import { useWorkspaceStore } from '~store/use-workspace-store';

vi.mock('~store/use-workspace-store', async () => {
  const { create } = await import('zustand');
  return { useWorkspaceStore: create(() => ({ status: 'loading' })) };
});
const send = vi.fn<(request: unknown) => Promise<unknown>>();
const entry = {
  id: 'recording',
  status: 'failed',
  description: 'Own pending publication',
  publicationDate: '2026-10-02T18:00:00Z',
  error: 'Not saved for durable retry. Keep the browser open and retry.',
};
beforeEach(() => {
  useSettingsStore.setState({ recordOwnPublications: true });
  useWorkspaceStore.setState(
    {
      status: 'ready',
      snapshot: {
        userId: 'user',
        organizationId: 'org',
        organizationLabel: 'Org',
        brandId: 'brand',
        revision: 1,
        brands: [],
        organizations: [],
        isApiKey: false,
      },
    },
    true,
  );
  Object.assign(chrome.runtime, { sendMessage: send });
  send.mockReset().mockResolvedValue({
    success: true,
    data: { kind: 'list', enabled: true, entries: [entry] },
  });
});
afterEach(cleanup);
it('shows default-on preference, boundedcoverage and explicitlyrecoverable records', async () => {
  render(<PublicationRecordingSettings />);
  expect(
    screen.getByRole('switch', { name: 'Record my published posts' }),
  ).toHaveAttribute('aria-checked', 'true');
  expect(
    screen.getByText(/Currently observing text posts from the X home composer/),
  ).toBeInTheDocument();
  expect(
    await screen.findByText('Own pending publication'),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      'Not saved for durable retry. Keep the browser open and retry.',
    ),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('switch'));
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await screen.findByText('Own pending publication');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
});
it('Retry/Dismiss use only explicitbackgroundmessages without native publication', async () => {
  render(<PublicationRecordingSettings />);
  await screen.findByText('Own pending publication');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() =>
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      event: 'publicationCaptureRetry',
      id: 'recording',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  await waitFor(() =>
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      event: 'publicationCaptureDismiss',
      id: 'recording',
    }),
  );
});
it('clears prior-scope entries immediately and ignores delayedlistresponses', async () => {
  let finish!: (response: unknown) => void;
  send.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<PublicationRecordingSettings />);
  act(() => useWorkspaceStore.setState({ status: 'loading' }, true));
  await act(async () =>
    finish({
      success: true,
      data: { kind: 'list', enabled: true, entries: [entry] },
    }),
  );
  expect(screen.queryByText('Own pending publication')).toBeNull();
});

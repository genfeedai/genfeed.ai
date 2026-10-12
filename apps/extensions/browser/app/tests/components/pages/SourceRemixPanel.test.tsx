import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceRemixPanel } from '~components/pages/SourceRemixPanel';
import type { ImportedSourceView } from '~models/imported-source.model';
import { useBrandStore } from '~store/use-brand-store';
import {
  REMIX_BRAND,
  REMIX_RUN,
  REMIX_SOURCE,
  remixExecution,
  remixQuote,
  remixView,
} from '../../fixtures/source-remix';

const source = {
  brandId: REMIX_BRAND,
  createdAt: '2026-10-12T10:00:00.000Z',
  deduplicated: false,
  id: REMIX_SOURCE,
  identityDigest: 'c'.repeat(64),
  recordVersion: 1,
  snapshot: {
    canonicalUrl: 'https://x.com/author/status/1',
    capturedAt: '2026-10-12T10:00:00.000Z',
    capturedText: 'Saved post text',
    captureSurface: 'extension',
    contentBasis: 'visible_page',
    evidenceAuthority: 'client_reported',
    host: 'x.com',
    kind: 'social',
    provenance: 'imported',
    title: 'Ship without permission',
  },
  updatedAt: '2026-10-12T10:00:00.000Z',
} as ImportedSourceView;

type Json = Record<string, unknown>;
let respond: (message: Json) => unknown;

function sent(event: string): Json[] {
  return vi
    .mocked(chrome.runtime.sendMessage)
    .mock.calls.map((call) => call[0] as unknown as Json)
    .filter((message) => message?.event === event);
}

const quoted = () =>
  remixView({
    generationQuote: remixQuote({
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    }),
  });

beforeEach(() => {
  useBrandStore.setState({ activeBrandId: REMIX_BRAND, brands: [] });
  respond = () => ({ error: 'Unsupported fixture request', success: false });
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(
    async (message) => respond(message as unknown as Json) as never,
  );
  vi.mocked(chrome.tabs.create).mockReset();
});

describe('Remix now panel', () => {
  it('opens a draft remix and generates nothing until a quote is approved', async () => {
    respond = (message) =>
      message.event === 'sourceRemixOpen'
        ? { data: remixView(), success: true }
        : { success: false, error: 'Unexpected' };
    render(<SourceRemixPanel onClose={vi.fn()} source={source} />);
    expect(
      await screen.findByRole('button', { name: 'Get a price' }),
    ).toBeEnabled();
    expect(sent('sourceRemixOpen')[0]).toMatchObject({
      brandId: REMIX_BRAND,
      sourceId: REMIX_SOURCE,
    });
    expect(
      screen.getByText(/the original stays unchanged/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Angle: Show the outcome first.'),
    ).toBeInTheDocument();
    expect(sent('sourceRemixQuote')).toHaveLength(0);
    expect(sent('sourceRemixExecute')).toHaveLength(0);
  });

  it('shows the price, and only the approval starts generation with that quote', async () => {
    respond = (message) => {
      if (message.event === 'sourceRemixOpen')
        return { data: remixView(), success: true };
      if (message.event === 'sourceRemixQuote')
        return { data: quoted(), success: true };
      if (message.event === 'sourceRemixExecute')
        return {
          data: remixView({
            execution: remixExecution(['queued', 'queued', 'queued']),
            generationQuote: remixQuote({
              acceptedAt: '2026-10-12T10:01:00.000Z',
            }),
            phase: 'generating',
            status: 'running',
          }),
          success: true,
        };
      return { success: false };
    };
    render(<SourceRemixPanel onClose={vi.fn()} source={source} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Get a price' }));
    expect(
      await screen.findByText('3 copy variations × 2 credits = 6 credits.'),
    ).toBeInTheDocument();
    expect(sent('sourceRemixQuote')[0]).toMatchObject({
      expectedRevision: 1,
      runId: REMIX_RUN,
    });
    expect(sent('sourceRemixExecute')).toHaveLength(0);

    fireEvent.click(
      screen.getByRole('button', { name: 'Approve and generate' }),
    );
    expect(await screen.findByText('Generating 0 of 3…')).toBeInTheDocument();
    expect(sent('sourceRemixExecute')).toHaveLength(1);
    expect(sent('sourceRemixExecute')[0]).toMatchObject({
      expectedRevision: 1,
      quoteId: 'quote-1',
      runId: REMIX_RUN,
    });
  });

  it('polls the run while generating and then shows the linked result', async () => {
    const generating = remixView({
      execution: remixExecution(['processing', 'queued', 'queued']),
      phase: 'generating',
      status: 'running',
    });
    respond = (message) => {
      if (message.event === 'sourceRemixOpen')
        return { data: generating, success: true };
      if (message.event === 'sourceRemixGet')
        return {
          data: remixView({
            execution: remixExecution(['ready', 'ready', 'ready']),
            phase: 'ready_for_review',
            status: 'completed',
          }),
          success: true,
        };
      return { success: false };
    };
    render(<SourceRemixPanel onClose={vi.fn()} source={source} />);
    expect(await screen.findByText('Generating 0 of 3…')).toBeInTheDocument();
    expect(
      await screen.findByText('Generated copy 1', {}, { timeout: 7000 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Generated from "Ship without permission"/),
    ).toBeInTheDocument();
    expect(sent('sourceRemixGet')[0]).toMatchObject({ runId: REMIX_RUN });
    expect(sent('sourceRemixExecute')).toHaveLength(0);
  }, 12_000);

  it('offers a revision after a failure and needs a new quote before another paid attempt', async () => {
    respond = (message) => {
      if (message.event === 'sourceRemixOpen')
        return {
          data: remixView({
            execution: remixExecution(['failed', 'failed', 'failed']),
            phase: 'failed',
            status: 'failed',
          }),
          success: true,
        };
      if (message.event === 'sourceRemixRevise')
        return { data: remixView({ revision: 2 }), success: true };
      return { success: false };
    };
    render(<SourceRemixPanel onClose={vi.fn()} source={source} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Generation failed. The model rejected the request.',
    );
    expect(
      screen.getByText(/needs a new price and your approval/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Revise and try again' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Get a price' }),
    ).toBeInTheDocument();
    expect(sent('sourceRemixRevise')[0]).toMatchObject({
      edits: { output: { count: 3 } },
      expectedRevision: 1,
    });
    expect(sent('sourceRemixExecute')).toHaveLength(0);
    expect(sent('sourceRemixQuote')).toHaveLength(0);
  });

  it('keeps video remixes in Studio and never offers a price for them', async () => {
    respond = (message) => {
      if (message.event === 'sourceRemixOpen')
        return {
          data: remixView({
            draft: {
              fidelityMode: 'guided',
              identity: {},
              intent: { objective: 'Create an original brand execution.' },
              output: { aspectRatio: '9:16', count: 1, kind: 'video' },
              references: [],
              reviewRequired: true,
              target: { kind: 'organic', platform: 'youtube' },
            },
          }),
          success: true,
        };
      if (message.event === 'sourceRemixStudioUrl')
        return {
          data: `https://app.genfeed.ai/acme/moonrise/studio/storyboard/${REMIX_RUN}`,
          success: true,
        };
      return { success: false };
    };
    render(<SourceRemixPanel onClose={vi.fn()} source={source} />);
    const open = await screen.findByRole('button', { name: 'Open in Studio' });
    expect(screen.queryByRole('button', { name: 'Get a price' })).toBeNull();
    fireEvent.click(open);
    await waitFor(() =>
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: `https://app.genfeed.ai/acme/moonrise/studio/storyboard/${REMIX_RUN}`,
      }),
    );
  });

  it('requires an image model before an image quote can be requested', async () => {
    respond = (message) => {
      if (message.event === 'sourceRemixOpen')
        return {
          data: remixView({
            draft: {
              fidelityMode: 'guided',
              identity: {},
              intent: { objective: 'Create an original brand execution.' },
              output: { aspectRatio: '1:1', count: 3, kind: 'image' },
              references: [],
              reviewRequired: true,
              target: { kind: 'organic', platform: 'instagram' },
            },
          }),
          success: true,
        };
      if (message.event === 'sourceRemixModels')
        return { data: [{ key: 'img-a', label: 'Image A' }], success: true };
      return { success: false };
    };
    render(<SourceRemixPanel onClose={vi.fn()} source={source} />);
    expect(
      await screen.findByRole('button', { name: 'Get a price' }),
    ).toBeDisabled();
    await waitFor(() => expect(sent('sourceRemixModels')).toHaveLength(1));
  });

  it('copies generated text without changing the run', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    respond = (message) =>
      message.event === 'sourceRemixOpen'
        ? {
            data: remixView({
              execution: remixExecution(['ready']),
              phase: 'ready_for_review',
              status: 'completed',
            }),
            success: true,
          }
        : { success: false };
    render(<SourceRemixPanel onClose={vi.fn()} source={source} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy text' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('Generated copy 1'),
    );
  });

  it('asks for a brand and closes on request', async () => {
    useBrandStore.setState({ activeBrandId: null });
    const onClose = vi.fn();
    render(<SourceRemixPanel onClose={onClose} source={source} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Select a brand before remixing a source.',
    );
    expect(sent('sourceRemixOpen')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportedSourcesPage } from '~components/pages/ImportedSourcesPage';
import type { RawSourceCapture } from '~models/imported-source.model';
import { useBrandStore } from '~store/use-brand-store';

vi.mock('~components/settings/BrandSelector', () => ({
  BrandSelector: () => <p>Brand selector</p>,
}));

const BRAND = 'cbrand000000001';

function source(
  id: string,
  overrides: Record<string, unknown> = {},
  snapshot: Record<string, unknown> = {},
) {
  return {
    brandId: BRAND,
    createdAt: '2026-10-12T00:00:00.000Z',
    deduplicated: false,
    id,
    identityDigest: 'c'.repeat(64),
    recordVersion: 1,
    snapshot: {
      authorDisplayName: 'Author',
      authorHandle: 'author',
      canonicalUrl: 'https://x.com/author/status/1',
      capturedAt: '2026-10-12T00:00:00.000Z',
      capturedText: 'Saved post text',
      captureSurface: 'extension',
      contentBasis: 'visible_page',
      evidenceAuthority: 'client_reported',
      host: 'x.com',
      kind: 'social',
      provenance: 'imported',
      title: 'Saved post',
      ...snapshot,
    },
    updatedAt: '2026-10-12T00:00:00.000Z',
    ...overrides,
  };
}

const articleCapture: RawSourceCapture = {
  author: 'Jane Writer',
  isSelection: false,
  media: [
    {
      kind: 'video',
      label: 'Demo',
      origin: 'player',
      url: 'https://www.youtube.com/embed/abc',
    },
    {
      kind: 'audio',
      label: 'Episode',
      origin: 'element',
      url: 'https://cdn.example.com/ep.mp3',
    },
  ],
  scope: 'page',
  text: 'A long enough captured article text.',
  title: 'Launch notes',
  typeHints: ['article'],
  url: 'https://blog.example.com/launch',
};

const handlers = {
  onAddToKnowledge: vi.fn(),
  onUseReference: vi.fn(),
};

type Respond = (message: Record<string, unknown>) => unknown;

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}
let respond: Respond;
let sources: unknown[];

function sent(event: string): Record<string, unknown>[] {
  return vi
    .mocked(chrome.runtime.sendMessage)
    .mock.calls.map((call) => asRecord(call[0]))
    .filter((message) => message?.event === event);
}

beforeEach(() => {
  handlers.onAddToKnowledge.mockReset();
  handlers.onUseReference.mockReset();
  sources = [];
  respond = () => ({ success: false, error: 'Unsupported fixture request' });
  useBrandStore.setState({ activeBrandId: BRAND, brands: [] });
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message) => {
    const event = (message as { event?: string }).event;
    if (event === 'importedSourceList') return { data: sources, success: true };
    if (event === 'captureSetBrand') return { success: true };
    return respond(asRecord(message));
  });
});

describe('Imported sources panel', () => {
  it('lists saved sources for the brand without generating or touching Knowledge', async () => {
    sources = [source('csource00000001')];
    render(<ImportedSourcesPage {...handlers} />);
    expect(await screen.findByText('Saved post')).toBeInTheDocument();
    expect(
      screen.getByText(/Social post · x\.com · Author @author/),
    ).toBeInTheDocument();
    expect(screen.getByText('Saved post text')).toBeInTheDocument();
    const events = vi
      .mocked(chrome.runtime.sendMessage)
      .mock.calls.map((call) => (call[0] as { event?: string }).event);
    expect(events).not.toContain('captureSave');
    expect(events).not.toContain('generateImage');
  });

  it('captures a page, shows an honest preview and saves for later without Knowledge', async () => {
    respond = (message) => {
      if (message.event === 'importedSourceCapture')
        return { data: articleCapture, success: true };
      if (message.event === 'importedSourceSave')
        return {
          data: { deduplicated: false, source: source('csource00000002') },
          success: true,
        };
      return { success: false };
    };
    render(<ImportedSourcesPage {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: 'Capture this page' }));
    expect(await screen.findByText('Launch notes')).toBeInTheDocument();
    expect(
      screen.getByText(/blog\.example\.com · Jane Writer/),
    ).toBeInTheDocument();
    expect(screen.getByText('Visible page text')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save for later' }));
    await waitFor(() => expect(sent('importedSourceSave')).toHaveLength(1));
    expect(sent('importedSourceSave')[0]).toMatchObject({
      brandId: BRAND,
      kind: 'article',
      // Pages never pick media for the user.
      mediaIndex: null,
      raw: articleCapture,
    });
    expect(
      await screen.findByText(/Saved for later\. Nothing was generated/),
    ).toBeInTheDocument();
    expect(handlers.onAddToKnowledge).not.toHaveBeenCalled();
    expect(sent('captureSave')).toHaveLength(0);
  });

  it('starts from a context-menu request and reports a capture failure honestly', async () => {
    respond = () => ({
      error: 'This page does not allow capture. Save its link instead.',
      success: false,
    });
    render(
      <ImportedSourcesPage
        {...handlers}
        initialCapture={{ scope: 'selection' }}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This page does not allow capture',
    );
    expect(sent('importedSourceCapture')[0]).toMatchObject({
      capture: { scope: 'selection' },
    });
    expect(sent('importedSourceSave')).toHaveLength(0);
  });

  it('keeps Add to Knowledge a separate explicit action on a draft', async () => {
    respond = (message) =>
      message.event === 'importedSourceCapture'
        ? { data: articleCapture, success: true }
        : { success: false };
    render(<ImportedSourcesPage {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: 'Capture this page' }));
    await screen.findByText('Launch notes');
    fireEvent.click(screen.getByRole('button', { name: 'Add to Knowledge' }));
    expect(handlers.onAddToKnowledge).toHaveBeenCalledWith({
      mode: 'page',
      text: articleCapture.text,
      title: 'Launch notes',
      url: 'https://blog.example.com/launch',
    });
    expect(sent('importedSourceSave')).toHaveLength(0);
  });

  it('offers an explicit save-again for a deleted source instead of recreating it', async () => {
    respond = (message) => {
      if (message.event === 'importedSourceCapture')
        return { data: articleCapture, success: true };
      if (message.event === 'importedSourceSave')
        return {
          code: 'IMPORTED_SOURCE_DELETED',
          deletedSourceId: 'cdeleted0000001',
          error:
            'This source was deleted earlier. Save it again to restore it.',
          success: false,
        };
      if (message.event === 'importedSourceRecapture')
        return {
          data: { deduplicated: false, source: source('csource00000003') },
          success: true,
        };
      return { success: false };
    };
    render(<ImportedSourcesPage {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: 'Capture this page' }));
    await screen.findByText('Launch notes');
    fireEvent.click(screen.getByRole('button', { name: 'Save for later' }));
    const again = await screen.findByRole('button', { name: 'Save it again' });
    expect(sent('importedSourceRecapture')).toHaveLength(0);
    fireEvent.click(again);
    await waitFor(() =>
      expect(sent('importedSourceRecapture')).toHaveLength(1),
    );
    expect(sent('importedSourceRecapture')[0]).toMatchObject({
      brandId: BRAND,
      sourceId: 'cdeleted0000001',
    });
  });
});

describe('saved source media', () => {
  const accessible = {
    availability: 'accessible',
    kind: 'image',
    url: 'https://cdn.example.com/p.jpg',
  };

  it('prepares media only on request and attaches the ready copy as a scoped reference', async () => {
    sources = [
      source(
        'csource00000001',
        {},
        { kind: 'image', selectedMedia: accessible },
      ),
    ];
    let state = 'not_requested';
    respond = (message) => {
      if (
        message.event === 'importedSourceMediaObserve' ||
        message.event === 'importedSourceMediaStart'
      ) {
        if (message.event === 'importedSourceMediaStart') state = 'ready';
        return {
          data: {
            artifact:
              state === 'ready'
                ? {
                    brandId: BRAND,
                    kind: 'ingredient',
                    organizationId: 'corg000000000001',
                    recordId: 'cmedia000000001',
                    recordVersion: '1',
                    serializer: 'ingredient',
                  }
                : undefined,
            bindingRevision: state === 'ready' ? 1 : 0,
            canRetry: false,
            id: 'cmedia000000001',
            ingredientId: state === 'ready' ? 'cmedia000000001' : undefined,
            mediaKind: state === 'ready' ? 'image' : undefined,
            sourceId: 'csource00000001',
            sourceIdentityDigest: 'c'.repeat(64),
            sourceRecordVersion: 1,
            state,
          },
          success: true,
        };
      }
      return { success: false };
    };
    render(<ImportedSourcesPage {...handlers} />);
    const prepare = await screen.findByRole('button', {
      name: 'Prepare media',
    });
    expect(sent('importedSourceMediaStart')).toHaveLength(0);
    fireEvent.click(prepare);
    const use = await screen.findByRole('button', { name: 'Use as reference' });
    expect(sent('importedSourceMediaStart')).toHaveLength(1);
    fireEvent.click(use);
    expect(handlers.onUseReference).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: BRAND,
        id: 'cmedia000000001',
        kind: 'image',
        reference: expect.objectContaining({
          brandId: BRAND,
          organizationId: 'corg000000000001',
          recordId: 'cmedia000000001',
          serializer: 'ingredient',
        }),
      }),
    );
  });

  it('never offers to copy an embedded or unavailable original and says why', async () => {
    sources = [
      source(
        'csource00000001',
        {},
        {
          kind: 'video',
          selectedMedia: {
            availability: 'embed_only',
            kind: 'video',
            url: 'https://www.youtube.com/watch?v=abc',
          },
          title: 'Embedded video',
        },
      ),
      source(
        'csource00000002',
        {},
        {
          kind: 'podcast',
          selectedMedia: {
            availability: 'unavailable',
            kind: 'audio',
            url: 'https://example.com/ep',
          },
          title: 'Private episode',
        },
      ),
    ];
    render(<ImportedSourcesPage {...handlers} />);
    await screen.findByText('Embedded video');
    expect(
      screen.getByText(/plays in the site's own player/),
    ).toBeInTheDocument();
    expect(screen.getByText(/private or stream-only/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prepare media' })).toBeNull();
    expect(sent('importedSourceMediaObserve')).toHaveLength(0);
    expect(sent('importedSourceMediaStart')).toHaveLength(0);
  });

  it('retries a failed copy only on the explicit click, fenced to the failed revision', async () => {
    sources = [
      source(
        'csource00000001',
        {},
        { kind: 'image', selectedMedia: accessible },
      ),
    ];
    const failed = {
      bindingRevision: 1,
      canRetry: true,
      errorCode: 'SOURCE_MEDIA_FAILED',
      id: 'cmedia000000001',
      ingestRevision: 4,
      sourceId: 'csource00000001',
      sourceIdentityDigest: 'c'.repeat(64),
      sourceRecordVersion: 1,
      state: 'failed',
    };
    respond = (message) => {
      if (message.event === 'importedSourceMediaObserve')
        return { data: failed, success: true };
      if (message.event === 'importedSourceMediaRetry')
        return {
          data: {
            ...failed,
            canRetry: false,
            ingestRevision: 5,
            state: 'processing',
          },
          success: true,
        };
      return { success: false };
    };
    render(<ImportedSourcesPage {...handlers} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The copy failed.',
    );
    expect(sent('importedSourceMediaRetry')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Retry media copy' }));
    await waitFor(() =>
      expect(sent('importedSourceMediaRetry')).toHaveLength(1),
    );
    expect(sent('importedSourceMediaRetry')[0]).toMatchObject({
      expectedIngestRevision: 4,
      sourceId: 'csource00000001',
    });
    expect(
      await screen.findByText(/Copying media to your Library/),
    ).toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GenerationActionCardStatusPanel } from './GenerationActionCardStatusPanel';

vi.mock('@genfeedai/agent/components/AgentMediaArtifactPreview', () => ({
  AgentMediaArtifactPreview: () => <div>Result preview</div>,
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand${path}` }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: { getInstance: () => ({ copyToClipboard: vi.fn() }) },
}));

function renderPanel(
  overrides: Partial<
    ComponentProps<typeof GenerationActionCardStatusPanel>
  > = {},
) {
  const onRetry = vi.fn();
  const onOpenInStudio = vi.fn();
  render(
    <GenerationActionCardStatusPanel
      error="status code 503"
      generationType="image"
      isImage
      onOpenInStudio={onOpenInStudio}
      onRegenerateProp={undefined}
      onRetry={onRetry}
      qualityFeedback={undefined}
      qualityScore={undefined}
      resultId="asset-1"
      resultUrl="https://example.com/result.png"
      status="error"
      {...overrides}
    />,
  );
  return { onOpenInStudio, onRetry };
}

describe('generation result recovery and navigation', () => {
  it('retries a transient failure using the supplied operation', () => {
    const { onRetry } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it.each([
    { error: 'Provider authentication failed' },
    { isPilotCeilingReached: true },
  ])('withholds retry for restricted failures: %j', (overrides) => {
    renderPanel(overrides);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('distinguishes editing the result from reusing generation settings', () => {
    const { onOpenInStudio, onRetry } = renderPanel({ status: 'done' });
    expect(screen.getByRole('link', { name: 'editResult' })).toHaveAttribute(
      'href',
      '/acme/brand/studio/edit?imageId=asset-1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'reuseSettings' }));
    expect(onOpenInStudio).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'viewInLibrary' })).toHaveAttribute(
      'href',
      expect.stringContaining('asset-1'),
    );
  });

  it('preserves video editing context', () => {
    renderPanel({ generationType: 'video', isImage: false, status: 'done' });
    expect(screen.getByRole('link', { name: 'editResult' })).toHaveAttribute(
      'href',
      '/acme/brand/studio/edit?videoId=asset-1',
    );
  });
});

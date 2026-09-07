// @vitest-environment jsdom

import {
  KnowledgeProcessingState,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ useKnowledgeLibrary: vi.fn() }));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@pages/library/knowledge/hooks/use-knowledge-library', () => ({
  useKnowledgeLibrary: (options: unknown) => mocks.useKnowledgeLibrary(options),
}));

import KnowledgeContextPicker, {
  countKnowledgeSelection,
  estimateKnowledgeTokens,
} from './KnowledgeContextPicker';

function row(id: string, state: KnowledgeProcessingState, isVisible = true) {
  return {
    source: {
      id,
      isVisible,
      purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
      title: `Source ${id}`,
    },
    spaceIds: [],
    version: { id: `${id}-v`, processingState: state },
  };
}

describe('KnowledgeContextPicker', () => {
  beforeEach(() => {
    mocks.useKnowledgeLibrary.mockReturnValue({
      isLoading: false,
      rows: [
        row('ready', KnowledgeProcessingState.READY),
        row('failed', KnowledgeProcessingState.FAILED),
        row('hidden', KnowledgeProcessingState.READY, false),
      ],
      spaces: [{ id: 'inbox', isInbox: true, title: 'Inbox' }],
    });
  });

  it('renders nothing without a brand', () => {
    const { container } = render(
      <KnowledgeContextPicker
        brandId={undefined}
        onChange={vi.fn()}
        value={{}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('offers only ready, visible sources and reports the selection budget', () => {
    const onChange = vi.fn();
    render(
      <KnowledgeContextPicker
        brandId="brand-1"
        onChange={onChange}
        value={{ sourceIds: ['ready'] }}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Knowledge · 1 selected/ }),
    );

    expect(screen.getByLabelText('Source ready')).toBeInTheDocument();
    expect(screen.queryByLabelText('Source failed')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Source hidden')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Up to 8 passages · ~1000 tokens/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Inbox'));
    expect(onChange).toHaveBeenLastCalledWith({
      sourceIds: ['ready'],
      spaceIds: ['inbox'],
    });
    fireEvent.click(screen.getByLabelText('Brand Truth'));
    expect(onChange).toHaveBeenLastCalledWith({
      purposes: [KnowledgeSourcePurpose.BRAND_TRUTH],
      sourceIds: ['ready'],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it('counts and estimates selections', () => {
    expect(countKnowledgeSelection({})).toBe(0);
    expect(estimateKnowledgeTokens({})).toBe(0);
    expect(
      countKnowledgeSelection({
        purposes: [KnowledgeSourcePurpose.RESEARCH],
        sourceIds: ['a', 'b'],
      }),
    ).toBe(3);
    expect(estimateKnowledgeTokens({ sourceIds: ['a'] })).toBe(1000);
  });
});

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

import KnowledgeReferenceSection, {
  countKnowledgeSelection,
  estimateKnowledgeTokens,
} from './KnowledgeReferenceSection';

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

describe('KnowledgeReferenceSection', () => {
  beforeEach(() => {
    mocks.useKnowledgeLibrary.mockReset();
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
      <KnowledgeReferenceSection
        brandId={undefined}
        onChange={vi.fn()}
        value={{}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('defaults to Auto without loading or listing sources', () => {
    render(
      <KnowledgeReferenceSection
        brandId="brand-1"
        onChange={vi.fn()}
        value={{}}
      />,
    );

    expect(
      screen.getByRole('checkbox', { name: 'Auto — use brand knowledge' }),
    ).toBeChecked();
    expect(
      screen.queryByRole('checkbox', { name: 'Source ready' }),
    ).not.toBeInTheDocument();
    expect(mocks.useKnowledgeLibrary).toHaveBeenLastCalledWith({
      brandId: undefined,
    });
  });

  it('lists only ready, visible sources once Auto is unchecked', () => {
    const onChange = vi.fn();
    render(
      <KnowledgeReferenceSection
        brandId="brand-1"
        onChange={onChange}
        value={{}}
      />,
    );

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Auto — use brand knowledge' }),
    );

    expect(mocks.useKnowledgeLibrary).toHaveBeenLastCalledWith({
      brandId: 'brand-1',
    });
    expect(
      screen.getByRole('checkbox', { name: 'Source ready' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Source failed' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Source hidden' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/brand knowledge stays automatic until you pick/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Source ready' }));
    expect(onChange).toHaveBeenLastCalledWith({ sourceIds: ['ready'] });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Inbox' }));
    expect(onChange).toHaveBeenLastCalledWith({ spaceIds: ['inbox'] });
  });

  it('opens on an explicit selection and clears it when Auto is re-checked', () => {
    const onChange = vi.fn();
    render(
      <KnowledgeReferenceSection
        brandId="brand-1"
        onChange={onChange}
        value={{ sourceIds: ['ready'] }}
      />,
    );

    const auto = screen.getByRole('checkbox', {
      name: 'Auto — use brand knowledge',
    });
    expect(auto).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Source ready' }),
    ).toBeChecked();
    expect(screen.getByText(/Up to 8 passages/)).toBeInTheDocument();

    fireEvent.click(auto);
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it('counts a selection and estimates its token budget', () => {
    expect(countKnowledgeSelection({})).toBe(0);
    expect(estimateKnowledgeTokens({})).toBe(0);
    expect(countKnowledgeSelection({ sourceIds: ['a'], spaceIds: ['b'] })).toBe(
      2,
    );
    expect(estimateKnowledgeTokens({ sourceIds: ['a'] })).toBe(1000);
  });
});

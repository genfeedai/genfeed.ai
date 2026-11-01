import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionRow,
  DefinitionTerm,
} from '@ui/primitives/definition-list';
import { describe, expect, it } from 'vitest';

describe('DefinitionList', () => {
  it('pairs each term with its detail in a properties list', () => {
    const { container } = render(
      <DefinitionList variant="properties">
        <DefinitionRow>
          <DefinitionTerm>Source</DefinitionTerm>
          <DefinitionDetail>Library</DefinitionDetail>
        </DefinitionRow>
      </DefinitionList>,
    );

    expect(screen.getByText('Source').tagName).toBe('DT');
    expect(screen.getByText('Library').tagName).toBe('DD');
    expect(container.querySelector('dl')).toHaveClass(
      'grid-cols-[auto_minmax(0,1fr)]',
    );
    expect(screen.getByText('Source').parentElement).toHaveClass('contents');
  });

  it('lays metrics out in the requested column count', () => {
    const { container } = render(
      <DefinitionList columns={3} variant="metrics">
        <DefinitionRow>
          <DefinitionTerm>Views</DefinitionTerm>
          <DefinitionDetail>4</DefinitionDetail>
        </DefinitionRow>
      </DefinitionList>,
    );

    expect(container.querySelector('dl')).toHaveClass('grid', 'grid-cols-3');
  });

  it('gives each ruled row its own two-column grid', () => {
    render(
      <DefinitionList variant="ruled">
        <DefinitionRow variant="split">
          <DefinitionTerm>Evidence</DefinitionTerm>
          <DefinitionDetail>Detail</DefinitionDetail>
        </DefinitionRow>
      </DefinitionList>,
    );

    expect(screen.getByText('Evidence').parentElement).toHaveClass('grid');
  });
});

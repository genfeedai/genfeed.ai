import {
  BreadcrumbLeafProvider,
  useBreadcrumbLeaf,
  useRegisterBreadcrumbLeaf,
} from '@genfeedai/contexts/ui/breadcrumb-leaf-context';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

function Probe() {
  const leaf = useBreadcrumbLeaf();
  return (
    <p data-testid="leaf">{leaf ? `${leaf.key}:${leaf.label}` : 'none'}</p>
  );
}

function Page({ label }: { readonly label?: string }) {
  useRegisterBreadcrumbLeaf('run-1', label);
  return null;
}

describe('breadcrumb leaf context', () => {
  it('publishes a page label and follows later changes', () => {
    const { rerender } = render(
      <BreadcrumbLeafProvider>
        <Page label="First title" />
        <Probe />
      </BreadcrumbLeafProvider>,
    );
    expect(screen.getByTestId('leaf')).toHaveTextContent('run-1:First title');

    rerender(
      <BreadcrumbLeafProvider>
        <Page label="Second title" />
        <Probe />
      </BreadcrumbLeafProvider>,
    );
    expect(screen.getByTestId('leaf')).toHaveTextContent('run-1:Second title');
  });

  it('clears the label when the page unmounts', () => {
    const { rerender } = render(
      <BreadcrumbLeafProvider>
        <Page label="Title" />
        <Probe />
      </BreadcrumbLeafProvider>,
    );
    rerender(
      <BreadcrumbLeafProvider>
        <Probe />
      </BreadcrumbLeafProvider>,
    );
    expect(screen.getByTestId('leaf')).toHaveTextContent('none');
  });

  it('is a no-op outside the shell provider', () => {
    render(
      <>
        <Page label="Title" />
        <Probe />
      </>,
    );
    expect(screen.getByTestId('leaf')).toHaveTextContent('none');
  });
});

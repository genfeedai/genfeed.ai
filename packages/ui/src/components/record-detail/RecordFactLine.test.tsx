import { fireEvent, render, screen } from '@testing-library/react';
import RecordFactLine from '@ui/record-detail/RecordFactLine';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    ({
      allDetailsCount: `All details (${values?.count})`,
    })[key] ?? key,
}));

describe('RecordFactLine', () => {
  it('renders nothing when every fact is empty', () => {
    const { container } = render(
      <RecordFactLine
        facts={[
          { id: 'a', label: 'Platform', value: undefined },
          { id: 'b', label: 'Status', value: '' },
        ]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('omits empty fields from the fact line', () => {
    render(
      <RecordFactLine
        facts={[
          { id: 'platform', label: 'Platform', value: 'X' },
          { id: 'account', label: 'Account', value: undefined },
          { id: 'status', label: 'Status', value: 'Scheduled' },
        ]}
      />,
    );

    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('X')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.queryByText('Account')).not.toBeInTheDocument();
  });

  it('treats a zero value as a known fact', () => {
    render(
      <RecordFactLine
        facts={[{ id: 'failures', label: 'Failures', value: 0 }]}
      />,
    );

    expect(screen.getByText('Failures')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows at most 6 facts inline and reveals the rest under All details', () => {
    const facts = Array.from({ length: 8 }, (_, index) => ({
      id: `fact-${index}`,
      label: `Fact ${index}`,
      value: `Value ${index}`,
    }));
    render(<RecordFactLine facts={facts} />);

    for (let index = 0; index < 6; index += 1) {
      expect(screen.getByText(`Fact ${index}`)).toBeInTheDocument();
    }
    expect(screen.queryByText('Fact 6')).not.toBeInTheDocument();
    expect(screen.queryByText('Fact 7')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('All details (2)'));

    expect(screen.getByText('Fact 6')).toBeInTheDocument();
    expect(screen.getByText('Fact 7')).toBeInTheDocument();
  });

  it('hides the All details disclosure when there is nothing left to reveal', () => {
    render(
      <RecordFactLine
        facts={[{ id: 'platform', label: 'Platform', value: 'X' }]}
      />,
    );

    expect(screen.queryByText(/All details/)).not.toBeInTheDocument();
  });

  it('respects a custom maxVisible', () => {
    render(
      <RecordFactLine
        facts={[
          { id: 'a', label: 'A', value: '1' },
          { id: 'b', label: 'B', value: '2' },
        ]}
        maxVisible={1}
      />,
    );

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
    expect(screen.getByText('All details (1)')).toBeInTheDocument();
  });
});

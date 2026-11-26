import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OptionTile, OptionTileGroup } from './option-tile';

function Harness() {
  const [value, setValue] = useState<string | undefined>('csv');
  return (
    <OptionTileGroup ariaLabel="Format" onValueChange={setValue} value={value}>
      <OptionTile description="Comma separated" title="CSV" value="csv" />
      <OptionTile description="Spreadsheet" title="XLSX" value="xlsx" />
    </OptionTileGroup>
  );
}

describe('OptionTile', () => {
  it('selects one tile at a time and shows its text', async () => {
    render(<Harness />);

    expect(screen.getByRole('radio', { name: /CSV/ })).toBeChecked();
    expect(screen.getByText('Spreadsheet')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /XLSX/ }));
    expect(screen.getByRole('radio', { name: /XLSX/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /CSV/ })).not.toBeChecked();
  });

  it('names the single-choice group a radiogroup', () => {
    render(<Harness />);

    expect(screen.getByRole('radiogroup', { name: 'Format' })).toBeVisible();
  });

  it('checks the tile an arrow key moves focus to, and skips unavailable tiles', async () => {
    function ArrowHarness() {
      const [value, setValue] = useState<string | undefined>('csv');
      return (
        <OptionTileGroup
          ariaLabel="Format"
          onValueChange={setValue}
          value={value}
        >
          <OptionTile title="CSV" value="csv" />
          <OptionTile isUnavailable title="PDF" value="pdf" />
          <OptionTile title="XLSX" value="xlsx" />
        </OptionTileGroup>
      );
    }
    render(<ArrowHarness />);

    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'CSV' })).toHaveFocus();

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'PDF' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'CSV' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'PDF' })).not.toBeChecked();

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'XLSX' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'XLSX' })).toBeChecked();
  });

  it('keeps the selected tile when it is pressed again', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('radio', { name: /CSV/ }));
    expect(screen.getByRole('radio', { name: /CSV/ })).toBeChecked();
  });

  it('toggles tiles independently in multiple mode', async () => {
    const onValueChange = vi.fn();
    render(
      <OptionTileGroup
        ariaLabel="Goals"
        onValueChange={onValueChange}
        type="multiple"
        value={['reach']}
      >
        <OptionTile title="Reach" value="reach" />
        <OptionTile title="Leads" value="leads" />
      </OptionTileGroup>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Leads' }));
    expect(onValueChange).toHaveBeenCalledWith(['reach', 'leads']);
  });
  it('keeps an unavailable tile focusable, described by its reason, and unselectable', async () => {
    const onValueChange = vi.fn();
    render(
      <OptionTileGroup
        ariaLabel="Platform"
        onValueChange={onValueChange}
        value="x"
      >
        <OptionTile title="X" value="x" />
        <OptionTile
          description="Not available yet"
          isUnavailable
          title="Reddit"
          value="reddit"
        />
      </OptionTileGroup>,
    );

    const reddit = screen.getByRole('radio', { name: /Reddit/ });
    expect(reddit).toHaveAccessibleDescription('Not available yet');
    expect(reddit).not.toBeDisabled();
    reddit.focus();
    expect(reddit).toHaveFocus();

    await userEvent.click(reddit);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(reddit).not.toBeChecked();
  });

  it('marks a busy tile for assistive technology', () => {
    render(
      <OptionTileGroup ariaLabel="Frames" onValueChange={vi.fn()} value="a">
        <OptionTile isBusy title="Frame A" value="a" />
      </OptionTileGroup>,
    );
    expect(screen.getByRole('radio', { name: 'Frame A' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
  it('centers the icon of a title-only tile and keeps it on the title line when there is a description', () => {
    render(
      <OptionTileGroup ariaLabel="Metric" onValueChange={vi.fn()} value="a">
        <OptionTile icon={<span>•</span>} title="Views" value="a" />
        <OptionTile
          description="Counted per post"
          icon={<span>•</span>}
          title="Posts"
          value="b"
        />
      </OptionTileGroup>,
    );
    expect(screen.getByRole('radio', { name: /Views/ })).toHaveClass(
      'items-center',
    );
    expect(screen.getByRole('radio', { name: /Posts/ })).toHaveClass(
      'items-start',
    );
  });
});

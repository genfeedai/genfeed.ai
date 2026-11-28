import { fireEvent, render, screen } from '@testing-library/react';
import RepostVariantControls, {
  getDefaultRepostVariantSelection,
  hasRepostVariantChange,
  type RepostVariantSelection,
  toRepostVariantParams,
} from '@ui/modals/ingredients/RepostVariantControls';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const NOTHING: RepostVariantSelection = {
  isMirrored: false,
  isSpedUp: false,
  isTrimmedAtStart: false,
  isZoomed: false,
};

describe('toRepostVariantParams', () => {
  it('starts from a mirror and a small speed-up', () => {
    expect(toRepostVariantParams(getDefaultRepostVariantSelection())).toEqual({
      isMirrored: true,
      speed: 1.1,
    });
  });

  it('sends every picked change with its preset value', () => {
    expect(
      toRepostVariantParams({
        isMirrored: true,
        isSpedUp: true,
        isTrimmedAtStart: true,
        isZoomed: true,
      }),
    ).toEqual({
      isMirrored: true,
      speed: 1.1,
      trimStartSeconds: 2,
      zoom: 1.05,
    });
  });

  it('leaves an unpicked change out of the request', () => {
    expect(toRepostVariantParams({ ...NOTHING, isZoomed: true })).toEqual({
      zoom: 1.05,
    });
  });
});

describe('hasRepostVariantChange', () => {
  it('is false until one change is picked', () => {
    expect(hasRepostVariantChange(NOTHING)).toBe(false);
    expect(hasRepostVariantChange({ ...NOTHING, isMirrored: true })).toBe(true);
  });
});

function Harness({
  onChange,
}: {
  onChange: (s: RepostVariantSelection) => void;
}) {
  const [selection, setSelection] = useState(getDefaultRepostVariantSelection);
  return (
    <RepostVariantControls
      selection={selection}
      onChange={(next) => {
        setSelection(next);
        onChange(next);
      }}
    />
  );
}

describe('RepostVariantControls', () => {
  it('shows the four changes and reports a toggled one', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(4);

    fireEvent.click(screen.getByText('zoom'));

    expect(onChange).toHaveBeenLastCalledWith({
      isMirrored: true,
      isSpedUp: true,
      isTrimmedAtStart: false,
      isZoomed: true,
    });
  });
});

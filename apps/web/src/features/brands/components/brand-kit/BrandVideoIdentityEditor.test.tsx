import type { BrandVideoRulesV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandVideoIdentityEditor from './BrandVideoIdentityEditor';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  const t = translateFromCatalog('pages.brandVideoKit');
  return { useTranslations: () => t };
});

function renderEditor(video?: BrandVideoRulesV1, isDisabled = false) {
  const onChange = vi.fn();
  render(
    <BrandVideoIdentityEditor
      video={video}
      isDisabled={isDisabled}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe('BrandVideoIdentityEditor', () => {
  it('starts every choice unset and keeps the dependent controls off', () => {
    renderEditor();

    expect(
      screen.getByLabelText('Average shot length (seconds)'),
    ).toBeDisabled();
    expect(
      screen.getByRole('switch', { name: 'Place the logo in video frames' }),
    ).not.toBeChecked();
  });

  it('writes a shot rule as an owner rule with the fixed shape', () => {
    const onChange = renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Add shot rule' }));
    fireEvent.change(screen.getByLabelText('Shot rules 1'), {
      target: { value: 'Open on the product' },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      shotRules: [
        {
          evidenceIds: ['owner-video'],
          id: 'owner-video-shot-1',
          match: 'semantic',
          required: true,
          text: 'Open on the product',
        },
      ],
      thumbnailRules: [],
    });
  });

  it('never sends a blank rule row', () => {
    const onChange = renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Add thumbnail rule' }));

    expect(onChange).toHaveBeenLastCalledWith({
      shotRules: [],
      thumbnailRules: [],
    });
    expect(screen.getByLabelText('Thumbnail rules 1')).toBeInTheDocument();
  });

  it('turns the logo placement on with defaults and off again', () => {
    const onChange = renderEditor();

    fireEvent.click(
      screen.getByRole('switch', { name: 'Place the logo in video frames' }),
    );

    expect(onChange).toHaveBeenLastCalledWith({
      logoPlacement: {
        appliesTo: 'outro',
        evidenceIds: ['owner-video'],
        insetRatio: 0.04,
        position: 'top-right',
        sizeRatio: 0.12,
      },
      shotRules: [],
      thumbnailRules: [],
    });
  });

  it('removes the logo placement when the switch goes off', () => {
    const onChange = renderEditor({
      logoPlacement: {
        appliesTo: 'outro',
        evidenceIds: ['owner-video'],
        insetRatio: 0.04,
        position: 'top-right',
        sizeRatio: 0.12,
      },
      shotRules: [],
      thumbnailRules: [],
    });

    fireEvent.click(
      screen.getByRole('switch', { name: 'Place the logo in video frames' }),
    );

    expect(onChange).toHaveBeenLastCalledWith({
      shotRules: [],
      thumbnailRules: [],
    });
  });

  it('disables every control for a viewer who cannot edit', () => {
    renderEditor({ shotRules: [], thumbnailRules: [] }, true);

    expect(
      screen.getByRole('button', { name: 'Add shot rule' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('switch', { name: 'Place the logo in video frames' }),
    ).toBeDisabled();
  });
});

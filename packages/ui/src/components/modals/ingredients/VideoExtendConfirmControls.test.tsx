import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { VideoExtendModelOption } from '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import { fireEvent, render, screen } from '@testing-library/react';
import VideoExtendConfirmControls, {
  getDefaultVideoExtendSelection,
} from '@ui/modals/ingredients/VideoExtendConfirmControls';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

// The TipTap editor needs a real DOM layout; a textarea keeps these tests on
// the controls' own behaviour.
vi.mock('@ui/prompt-editor/PromptEditor', () => ({
  default: ({
    ariaLabel,
    placeholder,
    value,
    onValueChange,
  }: {
    ariaLabel?: string;
    placeholder?: string;
    value?: string;
    onValueChange?: (value: string) => void;
  }) => (
    <textarea
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
    />
  ),
}));

vi.mock('@ui/prompt-bars/components/toolbar/PromptBarCompactSelect', () => ({
  default: ({
    ariaLabel,
    value,
    options,
    onChange,
  }: {
    ariaLabel: string;
    value: string;
    options: Array<{ label: string; value: string }>;
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const model: VideoExtendModelOption = {
  key: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
  label: 'Veo',
  cost: 10,
  durations: [5, 10],
  defaultDuration: 10,
};

describe('VideoExtendConfirmControls', () => {
  it.each([undefined, [], [4.5], [0], [31]])(
    'does not invent duration choices when support is missing or invalid (%j)',
    (durations) => {
      const unsupported = { ...model, durations };
      expect(getDefaultVideoExtendSelection([unsupported])).toBeUndefined();
      const onChange = vi.fn();
      const { container } = render(
        <VideoExtendConfirmControls
          modelOptions={[unsupported]}
          onChange={onChange}
        />,
      );
      expect(container).toBeEmptyDOMElement();
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it('uses the published default duration and quoted stitch charge', () => {
    expect(getDefaultVideoExtendSelection([model])).toMatchObject({
      duration: 10,
      model: model.key,
      cost: 11,
    });
    const onChange = vi.fn();
    render(
      <VideoExtendConfirmControls modelOptions={[model]} onChange={onChange} />,
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 10, cost: 11 }),
    );
  });

  it('chooses a published option when the saved default is unsupported', () => {
    expect(
      getDefaultVideoExtendSelection([{ ...model, defaultDuration: 8 }])
        ?.duration,
    ).toBe(5);
  });

  it('does not substitute another model after the selected model disappears', () => {
    const onChange = vi.fn();
    const { rerender, container } = render(
      <VideoExtendConfirmControls modelOptions={[model]} onChange={onChange} />,
    );
    onChange.mockClear();
    rerender(
      <VideoExtendConfirmControls
        modelOptions={[{ ...model, key: 'another-model' }]}
        onChange={onChange}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('blocks an unknown per-second price instead of using the base cost', () => {
    expect(
      getDefaultVideoExtendSelection([{ ...model, pricingType: 'per-second' }]),
    ).toBeUndefined();
  });

  it('reports the continuation prompt and option changes to the confirm dialog', () => {
    const onChange = vi.fn();
    render(
      <VideoExtendConfirmControls modelOptions={[model]} onChange={onChange} />,
    );

    const prompt = screen.getByLabelText('continuationPromptLabel');
    expect(prompt).toHaveValue('Continue naturally from the final frame.');
    expect(prompt).toHaveAttribute(
      'placeholder',
      'continuationPromptPlaceholder',
    );
    expect(screen.getByLabelText('generationModelLabel')).toHaveValue(
      model.key,
    );

    fireEvent.change(prompt, { target: { value: 'Pan across the skyline' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ prompt: 'Pan across the skyline' }),
    );

    fireEvent.change(screen.getByLabelText('newClipDurationLabel'), {
      target: { value: '5' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        duration: 5,
        model: model.key,
        prompt: 'Pan across the skyline',
      }),
    );
  });
});

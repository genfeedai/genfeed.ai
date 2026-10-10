import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { VideoExtendModelOption } from '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import { render } from '@testing-library/react';
import VideoExtendConfirmControls, {
  getDefaultVideoExtendSelection,
} from '@ui/modals/ingredients/VideoExtendConfirmControls';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

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
});

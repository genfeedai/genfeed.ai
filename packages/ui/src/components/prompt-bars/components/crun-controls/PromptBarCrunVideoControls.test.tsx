import type {
  CrunInputControls,
  CrunVideoDraft,
} from '@genfeedai/contracts/interfaces';
import { createCrunVideoDraft } from '@genfeedai/helpers/crun-video-input.helper';
import type { CrunVideoControlsLabels } from '@genfeedai/props/studio/crun-video-controls.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PromptBarCrunVideoControls from './PromptBarCrunVideoControls';

function controlsFor(endpoint = 'kling/v2-5-turbo-pro'): CrunInputControls {
  const kling = endpoint === 'kling/v2-5-turbo-pro';
  return {
    endpoint,
    version: 'reviewed-video-v1',
    mediaKind: 'video',
    maxOutputs: 4,
    isBatchSupported: false,
    isAutoAspectReferenceRequired: false,
    referenceRoles: kling ? { img_urls: 'image' } : {},
    videoRules: {
      referenceMode: kling ? 'start-end' : 'none',
      omitAspectRatioWithReferences: kling,
      availableDurations: kling ? [5, 10] : [8],
    },
    fields: {
      prompt: {
        type: 'string',
        isRequired: true,
        minLength: 1,
        maxLength: kling ? 2500 : 5000,
      },
      duration: {
        type: 'integer',
        isRequired: false,
        enum: kling ? [5, 10] : [4, 6, 8],
        default: kling ? 5 : 8,
      },
      aspect_ratio: {
        type: 'string',
        isRequired: false,
        enum: kling ? ['1:1', '16:9', '9:16'] : ['16:9', '9:16'],
        default: '16:9',
      },
      ...(kling
        ? {
            negative_prompt: {
              type: 'string' as const,
              isRequired: false,
              maxLength: 2000,
            },
            cfg_scale: {
              type: 'number' as const,
              isRequired: false,
              minimum: 0,
              maximum: 1,
              default: 0.5,
            },
            img_urls: {
              type: 'array' as const,
              isRequired: false,
              format: 'uri' as const,
              minItems: 1,
              maxItems: 2,
            },
          }
        : {
            resolution: {
              type: 'string' as const,
              isRequired: false,
              enum: ['720p', '1080p', '4k'],
              default: '720p',
            },
            translate_prompt: {
              type: 'boolean' as const,
              isRequired: false,
              default: true,
            },
          }),
    },
  };
}

const labels: CrunVideoControlsLabels = {
  duration: 'Duration',
  aspectRatio: 'Aspect ratio',
  resolution: 'Resolution',
  negativePrompt: 'Negative prompt',
  guidanceScale: 'Guidance',
  translatePrompt: 'Translate prompt',
  pricingReviewRequired: 'Pricing review required',
  aspectFromFrames: 'Aspect from frames',
  invalidContract: 'Invalid contract',
  errorMessages: {
    required: 'Required',
    unknown: 'Unsupported',
    type: 'Invalid type',
    enum: 'Invalid option',
    bounds: 'Out of bounds',
    uri: 'Invalid reference',
    reference_required: 'Start frame required',
    pricing_unavailable: 'Pricing unavailable',
    contract_mismatch: 'Contract changed',
  },
};
function draftFor(controls = controlsFor()): CrunVideoDraft {
  const draft = createCrunVideoDraft(controls, 'motion');
  if (!draft) throw new Error('Invalid fixture');
  return draft;
}
function ControlledKling() {
  const controls = controlsFor();
  const [value, setValue] = useState(draftFor(controls));
  return (
    <PromptBarCrunVideoControls
      controls={controls}
      value={value}
      labels={labels}
      onChange={(patch) => setValue((current) => ({ ...current, ...patch }))}
    />
  );
}
describe('unmounted reviewed video scalar controls', () => {
  it('renders accessible Kling-only controls from projection', () => {
    render(<ControlledKling />);
    expect(
      screen.getByRole('combobox', { name: 'Duration' }),
    ).toHaveTextContent('5s');
    expect(
      screen.getByRole('combobox', { name: 'Aspect ratio' }),
    ).toHaveTextContent('16:9');
    expect(screen.getByLabelText('Negative prompt')).toHaveAttribute(
      'maxlength',
      '2000',
    );
    expect(
      screen.getByRole('spinbutton', { name: 'Guidance' }),
    ).toHaveAttribute('min', '0');
    expect(screen.getByRole('spinbutton')).toHaveAttribute('max', '1');
    expect(screen.getByRole('spinbutton')).toHaveAttribute('step', '0.01');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Resolution' })).toBeNull();
  });
  it('uses real keyboard options and emits numeric reviewed duration', () => {
    const onChange = vi.fn();
    render(
      <PromptBarCrunVideoControls
        controls={controlsFor()}
        value={draftFor()}
        labels={labels}
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Duration' }), {
      key: 'ArrowDown',
    });
    const option = screen.getByRole('option', { name: '10s' });
    option.focus();
    fireEvent.keyDown(option, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({ duration: 10 });
  });
  it('keeps unpriced Veo durations visible and disabled', () => {
    const controls = controlsFor('google/veo3-1-fast-t2v');
    render(
      <PromptBarCrunVideoControls
        controls={controls}
        value={draftFor(controls)}
        labels={labels}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('combobox', { name: 'Resolution' }),
    ).toHaveTextContent('720p');
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByLabelText('Negative prompt')).toBeNull();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Duration' }), {
      key: 'ArrowDown',
    });
    for (const duration of [4, 6])
      expect(
        screen.getByRole('option', {
          name: `${duration}s — Pricing review required`,
        }),
      ).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('option', { name: '8s' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
  it('preserves explicit translation false', () => {
    const controls = controlsFor('google/veo3-1-fast-t2v');
    const onChange = vi.fn();
    render(
      <PromptBarCrunVideoControls
        controls={controls}
        value={draftFor(controls)}
        labels={labels}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Translate prompt' }));
    expect(onChange).toHaveBeenCalledWith({ translatePrompt: false });
  });
  it('responds to supplied frame changes without an effect or picker', () => {
    const props = {
      controls: controlsFor(),
      value: draftFor(),
      labels,
      onChange: vi.fn(),
    };
    const { rerender } = render(<PromptBarCrunVideoControls {...props} />);
    rerender(
      <PromptBarCrunVideoControls
        {...props}
        value={{ ...props.value, startFrameId: 'start' }}
      />,
    );
    expect(screen.queryByRole('combobox', { name: 'Aspect ratio' })).toBeNull();
    expect(screen.getByText('Aspect from frames')).toBeInTheDocument();
    rerender(<PromptBarCrunVideoControls {...props} />);
    expect(
      screen.getByRole('combobox', { name: 'Aspect ratio' }),
    ).toBeInTheDocument();
    expect(props.onChange).not.toHaveBeenCalled();
  });
  it('exposes length and guidance errors with associated IDs without clamping', () => {
    render(<ControlledKling />);
    fireEvent.change(screen.getByLabelText('Negative prompt'), {
      target: { value: 'x'.repeat(2001) },
    });
    expect(screen.getByLabelText('Negative prompt')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    const guidance = screen.getByRole('spinbutton');
    fireEvent.change(guidance, { target: { value: '1.1' } });
    expect(guidance).toHaveValue(1.1);
    expect(guidance).toHaveAttribute('aria-invalid', 'true');
    expect(
      document.getElementById(guidance.getAttribute('aria-describedby') ?? ''),
    ).toHaveTextContent('Out of bounds');
    fireEvent.change(guidance, { target: { value: '0' } });
    expect(guidance).toHaveValue(0);
    fireEvent.change(guidance, { target: { value: '' } });
    expect(guidance).toHaveValue(null);
  });
  it('disables every input and prevents callbacks', () => {
    const onChange = vi.fn();
    render(
      <PromptBarCrunVideoControls
        controls={controlsFor()}
        value={draftFor()}
        labels={labels}
        isDisabled
        onChange={onChange}
      />,
    );
    for (const control of [
      ...screen.getAllByRole('combobox'),
      screen.getByRole('spinbutton'),
      screen.getByLabelText('Negative prompt'),
    ])
      expect(control).toBeDisabled();
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText('Negative prompt'), {
      target: { value: 'test' },
    });
    expect(onChange).not.toHaveBeenCalled();
  });
  it.each(['modelKey', 'contractVersion'] as const)(
    'fails closed on %s mismatch',
    (key) => {
      render(
        <PromptBarCrunVideoControls
          controls={controlsFor()}
          value={{ ...draftFor(), [key]: 'wrong' }}
          labels={labels}
          onChange={vi.fn()}
        />,
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid contract');
      expect(screen.queryByRole('combobox')).toBeNull();
    },
  );
  it('fails closed for image controls', () => {
    render(
      <PromptBarCrunVideoControls
        controls={{ ...controlsFor(), mediaKind: 'image' }}
        value={draftFor()}
        labels={labels}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid contract');
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });
});

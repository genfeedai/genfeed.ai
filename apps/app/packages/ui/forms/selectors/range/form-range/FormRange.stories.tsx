import type { Meta, StoryObj } from '@storybook/nextjs';
import FormRange from '@ui/forms/selectors/range/form-range/FormRange';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

/**
 * FormRange component for range sliders.
 * Shows current value and supports custom min/max/step values.
 */
const meta = {
  argTypes: {
    isDisabled: {
      control: 'boolean',
      description: 'Disables slider interaction',
    },
    isRequired: {
      control: 'boolean',
      description: 'Marks slider as required',
    },
    label: {
      control: 'text',
      description: 'Label text displayed above range',
    },
    max: {
      control: 'number',
      description: 'Maximum value',
    },
    min: {
      control: 'number',
      description: 'Minimum value',
    },
    name: {
      control: 'text',
      description: 'Range input name',
    },
    showLabels: {
      control: 'boolean',
      description: 'Shows min/max labels below slider',
    },
    showValue: {
      control: 'boolean',
      description: 'Shows current value next to label',
    },
    step: {
      control: 'number',
      description: 'Step increment',
    },
  },
  component: FormRange,
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A range slider component with value display, min/max labels, and react-hook-form support.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Forms/FormRange',
} satisfies Meta<typeof FormRange>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default range slider (0-100)
 */
export const Default: Story = {
  args: {
    name: 'range',
  },
  render: () => {
    const { control } = useForm({
      defaultValues: { range: 50 },
    });

    return <FormRange name="range" label="Volume" control={control} />;
  },
};

/**
 * Range with custom min/max
 */
export const CustomRange: Story = {
  args: {
    name: 'range',
  },
  render: () => {
    const { control } = useForm({
      defaultValues: { price: 500 },
    });

    return (
      <FormRange
        name="price"
        label="Price Range"
        min={0}
        max={1000}
        step={50}
        control={control}
      />
    );
  },
};

/**
 * Range with min/max labels
 */
export const WithLabels: Story = {
  args: {
    name: 'range',
  },
  render: () => {
    const { control } = useForm({
      defaultValues: { temperature: 20 },
    });

    return (
      <FormRange
        name="temperature"
        label="Temperature"
        min={0}
        max={100}
        step={1}
        showLabels
        minLabel="Cold"
        maxLabel="Hot"
        control={control}
      />
    );
  },
};

/**
 * Range without value display
 */
export const NoValueDisplay: Story = {
  args: {
    name: 'range',
  },
  render: () => {
    const { control } = useForm({
      defaultValues: { opacity: 75 },
    });

    return (
      <FormRange
        name="opacity"
        label="Opacity"
        min={0}
        max={100}
        step={5}
        showValue={false}
        control={control}
      />
    );
  },
};

/**
 * Disabled range
 */
export const Disabled: Story = {
  args: {
    name: 'range',
  },
  render: () => {
    const { control } = useForm({
      defaultValues: { disabled: 50 },
    });

    return (
      <FormRange
        name="disabled"
        label="Locked Setting"
        isDisabled
        control={control}
      />
    );
  },
};

/**
 * Fine-grained control (small steps)
 */
export const FineControl: Story = {
  args: {
    name: 'range',
  },
  render: () => {
    const { control } = useForm({
      defaultValues: { brightness: 0.5 },
    });

    return (
      <FormRange
        name="brightness"
        label="Brightness"
        min={0}
        max={1}
        step={0.01}
        control={control}
      />
    );
  },
};

/**
 * Interactive example with state
 */
export const Interactive: Story = {
  args: {
    name: 'range',
  },
  render: () => {
    const [value, setValue] = useState(50);

    return (
      <div className="space-y-6">
        <FormRange
          name="interactive"
          label="Adjust Value"
          min={0}
          max={100}
          step={1}
          value={value}
          showLabels
          onChange={(e) => setValue(Number(e.target.value))}
        />

        <div className="space-y-2">
          <div className="text-sm text-foreground/70">
            Current value:{' '}
            <code className="bg-background px-2 py-1">{value}</code>
          </div>
          <div
            className="w-full bg-primary h-4"
            style={{ width: `${value}%` }}
          />
        </div>
      </div>
    );
  },
};

/**
 * Multiple ranges
 */
export const MultipleRanges: Story = {
  args: {
    name: 'range',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const { control, watch } = useForm({
      defaultValues: {
        balance: 50,
        bass: 50,
        treble: 50,
        volume: 75,
      },
    });

    const values = watch();

    return (
      <div className="space-y-6">
        <h4 className="font-semibold">Audio Settings</h4>

        <FormRange
          name="volume"
          label="Volume"
          min={0}
          max={100}
          step={1}
          showLabels
          control={control}
        />

        <FormRange
          name="bass"
          label="Bass"
          min={0}
          max={100}
          step={1}
          showLabels
          minLabel="Low"
          maxLabel="High"
          control={control}
        />

        <FormRange
          name="treble"
          label="Treble"
          min={0}
          max={100}
          step={1}
          showLabels
          minLabel="Low"
          maxLabel="High"
          control={control}
        />

        <FormRange
          name="balance"
          label="Balance"
          min={0}
          max={100}
          step={1}
          showLabels
          minLabel="Left"
          maxLabel="Right"
          control={control}
        />

        <div className="pt-4 border-t border-white/[0.08]">
          <pre className="text-xs bg-background p-3">
            {JSON.stringify(values, null, 2)}
          </pre>
        </div>
      </div>
    );
  },
};

/**
 * Age selector example
 */
export const AgeSelector: Story = {
  args: {
    name: 'range',
  },
  render: () => {
    const { control } = useForm({
      defaultValues: { age: 25 },
    });

    return (
      <FormRange
        name="age"
        label="Age"
        min={13}
        max={100}
        step={1}
        showLabels
        control={control}
      />
    );
  },
};

/**
 * Percentage selector
 */
export const Percentage: Story = {
  args: {
    name: 'range',
  },
  render: () => {
    const { control, watch } = useForm({
      defaultValues: { percentage: 50 },
    });

    const percentage = watch('percentage');

    return (
      <div className="space-y-4">
        <FormRange
          name="percentage"
          label="Completion"
          min={0}
          max={100}
          step={5}
          showLabels
          minLabel="0%"
          maxLabel="100%"
          control={control}
        />

        <div className="text-center">
          <div className="text-4xl font-bold text-primary">{percentage}%</div>
          <div className="text-sm text-foreground/70">Complete</div>
        </div>
      </div>
    );
  },
};

/**
 * Year range selector
 */
export const YearRange: Story = {
  args: {
    name: 'range',
  },
  render: () => {
    const { control } = useForm({
      defaultValues: { year: 2024 },
    });

    return (
      <FormRange
        name="year"
        label="Select Year"
        min={1900}
        max={2024}
        step={1}
        showLabels
        control={control}
      />
    );
  },
};

/**
 * Rating selector
 */
export const Rating: Story = {
  args: {
    name: 'range',
  },
  render: () => {
    const { control, watch } = useForm({
      defaultValues: { rating: 3 },
    });

    const rating = watch('rating');
    const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);

    return (
      <div className="space-y-4">
        <FormRange
          name="rating"
          label="Rating"
          min={1}
          max={5}
          step={1}
          showLabels
          minLabel="Poor"
          maxLabel="Excellent"
          control={control}
        />

        <div className="text-center text-3xl text-warning">{stars}</div>
      </div>
    );
  },
};

/**
 * Settings panel with ranges
 */
export const SettingsPanel: Story = {
  args: {
    name: 'range',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const { control, watch, handleSubmit } = useForm({
      defaultValues: {
        bitrate: 5000,
        framerate: 30,
        quality: 75,
      },
    });

    const values = watch();

    const onSubmit = (_data: any) => {
      // Settings saved
    };

    return (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <h4 className="font-semibold">Video Export Settings</h4>

        <FormRange
          name="quality"
          label="Quality"
          min={0}
          max={100}
          step={5}
          showLabels
          minLabel="Low"
          maxLabel="High"
          control={control}
        />

        <FormRange
          name="framerate"
          label="Frame Rate (FPS)"
          min={24}
          max={60}
          step={6}
          showLabels
          control={control}
        />

        <FormRange
          name="bitrate"
          label="Bitrate (kbps)"
          min={1000}
          max={10000}
          step={500}
          showLabels
          control={control}
        />

        <div className="pt-4 border-t border-white/[0.08] space-y-4">
          <div className="text-sm text-foreground/70">
            <div className="font-semibold mb-2">Preview:</div>
            <div className="bg-background p-3 space-y-1">
              <div>Quality: {values.quality}%</div>
              <div>Frame Rate: {values.framerate} FPS</div>
              <div>Bitrate: {values.bitrate} kbps</div>
            </div>
          </div>

          <button
            type="submit"
            className="h-8 px-3 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Save Settings
          </button>
        </div>
      </form>
    );
  },
};

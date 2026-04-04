import type { Meta, StoryObj } from '@storybook/nextjs';
import FormColorPicker from '@ui/forms/pickers/color-picker/form-color-picker/FormColorPicker';
import { useState } from 'react';

/**
 * FormColorPicker component using react-color's SketchPicker.
 * Allows users to select colors with a visual color picker interface.
 */
const meta = {
  argTypes: {
    isDisabled: {
      control: 'boolean',
      description: 'Disables color picker',
    },
    label: {
      control: 'text',
      description: 'Label text',
    },
    position: {
      control: 'select',
      description: 'Picker dropdown position',
      options: ['left', 'right'],
    },
    showAlpha: {
      control: 'boolean',
      description: 'Shows alpha/opacity slider',
    },
    value: {
      control: 'color',
      description: 'Color value (hex)',
    },
  },
  component: FormColorPicker,
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
          'A color picker component with preset colors, alpha channel support, and customizable positioning.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Forms/FormColorPicker',
} satisfies Meta<typeof FormColorPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default color picker
 */
export const Default: Story = {
  args: {
    label: 'Color',
    onChange: () => {},
    value: '#000000',
  },
  render: () => {
    const [color, setColor] = useState('#FF5733');

    return (
      <FormColorPicker label="Choose Color" value={color} onChange={setColor} />
    );
  },
};

/**
 * With help text
 */
export const WithHelpText: Story = {
  args: {
    label: 'Color',
    onChange: () => {},
    value: '#000000',
  },
  render: () => {
    const [color, setColor] = useState('#3B82F6');

    return (
      <FormColorPicker
        label="Brand Color"
        value={color}
        onChange={setColor}
        helpText="Select your brand's primary color"
      />
    );
  },
};

/**
 * With alpha/opacity control
 */
export const WithAlpha: Story = {
  args: {
    label: 'Color',
    onChange: () => {},
    value: '#000000',
  },
  render: () => {
    const [color, setColor] = useState('#FF5733');

    return (
      <FormColorPicker
        label="Background Color"
        value={color}
        onChange={setColor}
        showAlpha
        helpText="Supports transparency"
      />
    );
  },
};

/**
 * Disabled color picker
 */
export const Disabled: Story = {
  args: {
    label: 'Color',
    onChange: () => {},
    value: '#000000',
  },
  render: () => {
    return (
      <FormColorPicker
        label="Locked Color"
        value="#10B981"
        onChange={() => {}}
        isDisabled
      />
    );
  },
};

/**
 * Right-aligned picker
 */
export const RightAligned: Story = {
  args: {
    label: 'Color',
    onChange: () => {},
    value: '#000000',
  },
  render: () => {
    const [color, setColor] = useState('#8B5CF6');

    return (
      <FormColorPicker
        label="Accent Color"
        value={color}
        onChange={setColor}
        position="right"
        helpText="Picker opens to the right"
      />
    );
  },
};

/**
 * Custom preset colors
 */
export const CustomPresets: Story = {
  args: {
    label: 'Color',
    onChange: () => {},
    value: '#000000',
  },
  render: () => {
    const [color, setColor] = useState('#3B82F6');

    const brandColors = [
      '#3B82F6', // Blue
      '#10B981', // Green
      '#F59E0B', // Orange
      '#EF4444', // Red
      '#8B5CF6', // Purple
      '#EC4899', // Pink
      '#14B8A6', // Teal
      '#F97316', // Deep Orange
    ];

    return (
      <FormColorPicker
        label="Theme Color"
        value={color}
        onChange={setColor}
        presetColors={brandColors}
        helpText="Choose from brand colors"
      />
    );
  },
};

/**
 * Multiple color pickers
 */
export const MultipleColors: Story = {
  args: {
    label: 'Color',
    onChange: () => {},
    value: '#000000',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [colors, setColors] = useState({
      accent: '#F59E0B',
      background: '#FFFFFF',
      primary: '#3B82F6',
      secondary: '#8B5CF6',
    });

    const updateColor = (key: keyof typeof colors) => (value: string) => {
      setColors((prev) => ({ ...prev, [key]: value }));
    };

    return (
      <div className="space-y-4">
        <h4 className="font-semibold">Color Scheme</h4>

        <FormColorPicker
          label="Primary Color"
          value={colors.primary}
          onChange={updateColor('primary')}
        />

        <FormColorPicker
          label="Secondary Color"
          value={colors.secondary}
          onChange={updateColor('secondary')}
        />

        <FormColorPicker
          label="Accent Color"
          value={colors.accent}
          onChange={updateColor('accent')}
        />

        <FormColorPicker
          label="Background Color"
          value={colors.background}
          onChange={updateColor('background')}
        />

        <div className="pt-4 border-t border-white/[0.08]">
          <div className="text-sm font-semibold mb-2">Preview:</div>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(colors).map(([key, value]) => (
              <div key={key} className="text-center space-y-1">
                <div
                  className="w-full h-16 border border-white/[0.08]"
                  style={{ backgroundColor: value }}
                />
                <div className="text-xs text-foreground/70">{key}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
};

/**
 * Theme builder example
 */
export const ThemeBuilder: Story = {
  args: {
    label: 'Color',
    onChange: () => {},
    value: '#000000',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [theme, setTheme] = useState({
      error: '#EF4444',
      info: '#06B6D4',
      primary: '#3B82F6',
      secondary: '#8B5CF6',
      success: '#10B981',
      warning: '#F59E0B',
    });

    const updateTheme = (key: keyof typeof theme) => (value: string) => {
      setTheme((prev) => ({ ...prev, [key]: value }));
    };

    return (
      <div className="space-y-6">
        <h4 className="font-semibold text-lg">Theme Color Builder</h4>

        <div className="space-y-4">
          <FormColorPicker
            label="Primary"
            value={theme.primary}
            onChange={updateTheme('primary')}
            helpText="Main brand color"
          />

          <FormColorPicker
            label="Secondary"
            value={theme.secondary}
            onChange={updateTheme('secondary')}
            helpText="Secondary brand color"
          />

          <FormColorPicker
            label="Success"
            value={theme.success}
            onChange={updateTheme('success')}
            helpText="Success/positive actions"
          />

          <FormColorPicker
            label="Warning"
            value={theme.warning}
            onChange={updateTheme('warning')}
            helpText="Warning/caution states"
          />

          <FormColorPicker
            label="Error"
            value={theme.error}
            onChange={updateTheme('error')}
            helpText="Error/danger states"
          />

          <FormColorPicker
            label="Info"
            value={theme.info}
            onChange={updateTheme('info')}
            helpText="Informational messages"
          />
        </div>

        <div className="pt-4 border-t border-white/[0.08] space-y-4">
          <div className="font-semibold">Button Preview:</div>
          <div className="flex flex-wrap gap-2">
            <button
              className="h-8 px-3 text-sm font-medium"
              style={{ backgroundColor: theme.primary, color: 'white' }}
            >
              Primary
            </button>
            <button
              className="h-8 px-3 text-sm font-medium"
              style={{ backgroundColor: theme.secondary, color: 'white' }}
            >
              Secondary
            </button>
            <button
              className="h-8 px-3 text-sm font-medium"
              style={{ backgroundColor: theme.success, color: 'white' }}
            >
              Success
            </button>
            <button
              className="h-8 px-3 text-sm font-medium"
              style={{ backgroundColor: theme.warning, color: 'white' }}
            >
              Warning
            </button>
            <button
              className="h-8 px-3 text-sm font-medium"
              style={{ backgroundColor: theme.error, color: 'white' }}
            >
              Error
            </button>
            <button
              className="h-8 px-3 text-sm font-medium"
              style={{ backgroundColor: theme.info, color: 'white' }}
            >
              Info
            </button>
          </div>

          <div className="pt-4">
            <div className="font-semibold mb-2">CSS Variables:</div>
            <pre className="text-xs bg-background p-3 overflow-x-auto">
              {`:root {
  --color-primary: ${theme.primary};
  --color-secondary: ${theme.secondary};
  --color-success: ${theme.success};
  --color-warning: ${theme.warning};
  --color-error: ${theme.error};
  --color-info: ${theme.info};
}`}
            </pre>
          </div>
        </div>
      </div>
    );
  },
};

/**
 * Gradient builder
 */
export const GradientBuilder: Story = {
  args: {
    label: 'Color',
    onChange: () => {},
    value: '#000000',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [gradient, setGradient] = useState({
      end: '#8B5CF6',
      start: '#3B82F6',
    });

    const updateGradient = (key: keyof typeof gradient) => (value: string) => {
      setGradient((prev) => ({ ...prev, [key]: value }));
    };

    const gradientStyle = {
      background: `linear-gradient(135deg, ${gradient.start} 0%, ${gradient.end} 100%)`,
    };

    return (
      <div className="space-y-4">
        <h4 className="font-semibold">Gradient Builder</h4>

        <FormColorPicker
          label="Start Color"
          value={gradient.start}
          onChange={updateGradient('start')}
        />

        <FormColorPicker
          label="End Color"
          value={gradient.end}
          onChange={updateGradient('end')}
        />

        <div className="pt-4 border-t border-white/[0.08] space-y-2">
          <div className="font-semibold">Preview:</div>
          <div className="w-full h-32" style={gradientStyle} />

          <div className="font-semibold mt-4">CSS Code:</div>
          <pre className="text-xs bg-background p-3 overflow-x-auto">
            {`background: linear-gradient(135deg, ${gradient.start} 0%, ${gradient.end} 100%);`}
          </pre>
        </div>
      </div>
    );
  },
};

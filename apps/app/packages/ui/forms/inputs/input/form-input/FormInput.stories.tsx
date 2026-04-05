import type { Meta, StoryObj } from '@storybook/nextjs';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import { useState } from 'react';

/**
 * FormInput component for text input fields with support for various input types.
 * Integrates with react-hook-form when control prop is provided.
 */
const meta = {
  argTypes: {
    isDisabled: {
      control: 'boolean',
      description: 'Disables input interaction',
    },
    isReadOnly: {
      control: 'boolean',
      description: 'Makes input read-only',
    },
    isRequired: {
      control: 'boolean',
      description: 'Marks input as required',
    },
    name: {
      control: 'text',
      description: 'Input name attribute',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    type: {
      control: 'select',
      description: 'HTML input type',
      options: [
        'text',
        'color',
        'number',
        'email',
        'url',
        'password',
        'checkbox',
        'datetime-local',
        'hidden',
      ],
    },
  },
  component: FormInput,
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
          'A versatile input component with support for react-hook-form and various input types.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Forms/FormInput',
} satisfies Meta<typeof FormInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default text input
 */
export const Default: Story = {
  args: {
    name: 'default',
    placeholder: 'Enter text...',
    type: 'text',
  },
};

/**
 * Email input with validation
 */
export const Email: Story = {
  args: {
    name: 'email',
    placeholder: 'you@example.com',
    type: 'email',
  },
};

/**
 * Password input
 */
export const Password: Story = {
  args: {
    name: 'password',
    placeholder: 'Enter password...',
    type: 'password',
  },
};

/**
 * Number input with min/max/step
 */
export const Number: Story = {
  args: {
    max: 100,
    min: 0,
    name: 'quantity',
    placeholder: '0',
    step: 1,
    type: 'number',
  },
};

/**
 * Search input
 */
export const Search: Story = {
  args: {
    name: 'search',
    placeholder: 'Search...',
    type: 'text',
  },
};

/**
 * Required input
 */
export const Required: Story = {
  args: {
    isRequired: true,
    name: 'required',
    placeholder: 'This field is required',
    type: 'text',
  },
};

/**
 * Disabled input
 */
export const Disabled: Story = {
  args: {
    isDisabled: true,
    name: 'disabled',
    placeholder: 'Disabled input',
    type: 'text',
    value: 'Cannot edit this',
  },
};

/**
 * Read-only input
 */
export const ReadOnly: Story = {
  args: {
    isReadOnly: true,
    name: 'readonly',
    type: 'text',
    value: 'Read-only value',
  },
};

/**
 * URL input
 */
export const URL: Story = {
  args: {
    name: 'website',
    placeholder: 'https://example.com',
    type: 'url',
  },
};

/**
 * Telephone input
 */
export const Telephone: Story = {
  args: {
    name: 'phone',
    placeholder: '+1 (555) 000-0000',
    type: 'text',
  },
};

/**
 * Date input
 */
export const Date: Story = {
  args: {
    name: 'date',
    type: 'datetime-local',
  },
};

/**
 * Time input
 */
export const Time: Story = {
  args: {
    name: 'time',
    type: 'text',
  },
};

/**
 * Interactive example with state
 */
export const WithState: Story = {
  args: {
    name: 'input',
  },
  render: () => {
    const [value, setValue] = useState('');

    return (
      <div className="space-y-4">
        <FormInput
          name="interactive"
          type="text"
          placeholder="Type something..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="text-sm text-foreground/70">
          Current value:{' '}
          <code className="bg-background px-2 py-1">{value || '(empty)'}</code>
        </div>
      </div>
    );
  },
};

/**
 * Form with multiple input types
 */
export const FormExample: Story = {
  args: {
    name: 'input',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <form className="space-y-4">
      <div>
        <label className="block mb-2">
          <span className="text-sm font-medium">Name</span>
        </label>
        <FormInput name="name" type="text" placeholder="John Doe" isRequired />
      </div>

      <div>
        <label className="block mb-2">
          <span className="text-sm font-medium">Email</span>
        </label>
        <FormInput
          name="email"
          type="email"
          placeholder="john@example.com"
          isRequired
        />
      </div>

      <div>
        <label className="block mb-2">
          <span className="text-sm font-medium">Phone</span>
        </label>
        <FormInput name="phone" type="text" placeholder="+1 (555) 000-0000" />
      </div>

      <div>
        <label className="block mb-2">
          <span className="text-sm font-medium">Website</span>
        </label>
        <FormInput
          name="website"
          type="url"
          placeholder="https://example.com"
        />
      </div>

      <div>
        <label className="block mb-2">
          <span className="text-sm font-medium">Age</span>
        </label>
        <FormInput name="age" type="number" min={0} max={120} step={1} />
      </div>
    </form>
  ),
};

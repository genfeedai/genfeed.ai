import type { Meta, StoryObj } from '@storybook/nextjs';
import FormSelect from '@ui/forms/selectors/select/form-select/FormSelect';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

/**
 * FormSelect component for dropdown selection fields.
 * Supports labels, error states, and react-hook-form integration.
 */
const meta = {
  argTypes: {
    isDisabled: {
      control: 'boolean',
      description: 'Disables select interaction',
    },
    isFullWidth: {
      control: 'boolean',
      description: 'Makes select full width',
    },
    isRequired: {
      control: 'boolean',
      description: 'Marks select as required',
    },
    label: {
      control: 'text',
      description: 'Label text displayed above select',
    },
    name: {
      control: 'text',
      description: 'Select name attribute',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder option text',
    },
  },
  component: FormSelect,
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
          'A select dropdown component with label, error handling, and react-hook-form support.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Forms/FormSelect',
} satisfies Meta<typeof FormSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default select with label
 */
export const Default: Story = {
  args: {
    children: <></>,
    name: 'select',
  },
  render: () => (
    <FormSelect name="default" label="Choose an option">
      <option value="1">Option 1</option>
      <option value="2">Option 2</option>
      <option value="3">Option 3</option>
    </FormSelect>
  ),
};

/**
 * Select with custom placeholder
 */
export const WithPlaceholder: Story = {
  args: {
    children: <></>,
    name: 'select',
  },
  render: () => (
    <FormSelect
      name="country"
      label="Country"
      placeholder="Choose your country"
    >
      <option value="us">United States</option>
      <option value="ca">Canada</option>
      <option value="uk">United Kingdom</option>
      <option value="au">Australia</option>
      <option value="de">Germany</option>
    </FormSelect>
  ),
};

/**
 * Required select
 */
export const Required: Story = {
  args: {
    children: <></>,
    name: 'select',
  },
  render: () => (
    <FormSelect name="required" label="Account Type" isRequired>
      <option value="free">Free</option>
      <option value="pro">Pro</option>
      <option value="enterprise">Enterprise</option>
    </FormSelect>
  ),
};

/**
 * Disabled select
 */
export const Disabled: Story = {
  args: {
    children: <></>,
    name: 'select',
  },
  render: () => (
    <FormSelect name="disabled" label="Status" value="active" isDisabled>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
      <option value="pending">Pending</option>
    </FormSelect>
  ),
};

/**
 * Select with error state
 */
export const WithError: Story = {
  args: {
    children: <></>,
    name: 'select',
  },
  render: () => (
    <FormSelect
      name="error"
      label="Role"
      error="Please select a role"
      placeholder="Select a role"
    >
      <option value="admin">Admin</option>
      <option value="editor">Editor</option>
      <option value="viewer">Viewer</option>
    </FormSelect>
  ),
};

/**
 * Non-full-width select
 */
export const NotFullWidth: Story = {
  args: {
    children: <></>,
    name: 'select',
  },
  render: () => (
    <FormSelect name="size" label="Size" isFullWidth={false}>
      <option value="sm">Small</option>
      <option value="md">Medium</option>
      <option value="lg">Large</option>
      <option value="xl">Extra Large</option>
    </FormSelect>
  ),
};

/**
 * Select with grouped options
 */
export const WithGroups: Story = {
  args: {
    children: <></>,
    name: 'select',
  },
  render: () => (
    <FormSelect
      name="category"
      label="Category"
      placeholder="Choose a category"
    >
      <optgroup label="Fruits">
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
        <option value="orange">Orange</option>
      </optgroup>
      <optgroup label="Vegetables">
        <option value="carrot">Carrot</option>
        <option value="broccoli">Broccoli</option>
        <option value="spinach">Spinach</option>
      </optgroup>
      <optgroup label="Grains">
        <option value="rice">Rice</option>
        <option value="wheat">Wheat</option>
        <option value="oats">Oats</option>
      </optgroup>
    </FormSelect>
  ),
};

/**
 * Interactive example with state
 */
export const WithState: Story = {
  args: {
    children: <></>,
    name: 'select',
  },
  render: () => {
    const [selected, setSelected] = useState('');

    return (
      <div className="space-y-4">
        <FormSelect
          name="interactive"
          label="Select a framework"
          placeholder="Choose a framework"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="react">React</option>
          <option value="vue">Vue</option>
          <option value="angular">Angular</option>
          <option value="svelte">Svelte</option>
          <option value="solid">Solid</option>
        </FormSelect>

        <div className="text-sm text-foreground/70">
          Selected:{' '}
          <code className="bg-background px-2 py-1">
            {selected || '(none)'}
          </code>
        </div>
      </div>
    );
  },
};

/**
 * React Hook Form integration
 */
export const WithReactHookForm: Story = {
  args: {
    children: <></>,
    name: 'select',
  },
  render: () => {
    const { control, handleSubmit, watch } = useForm({
      defaultValues: {
        priority: '',
      },
    });

    const priority = watch('priority');

    const onSubmit = (data: any) => {
      // Form submitted
      alert(`Priority selected: ${data.priority}`);
    };

    return (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormSelect
          name="priority"
          label="Priority Level"
          placeholder="Select priority"
          control={control}
          isRequired
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </FormSelect>

        <div className="text-sm text-foreground/70">
          Current:{' '}
          <code className="bg-background px-2 py-1">
            {priority || '(none)'}
          </code>
        </div>

        <button
          type="submit"
          className="h-8 px-3 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Submit
        </button>
      </form>
    );
  },
};

/**
 * Form with multiple selects
 */
export const FormExample: Story = {
  args: {
    children: <></>,
    name: 'select',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const { control, handleSubmit } = useForm({
      defaultValues: {
        city: '',
        country: '',
        state: '',
        timezone: '',
      },
    });

    const onSubmit = (_data: any) => {
      // Form submitted
      alert('Check console for form data');
    };

    return (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormSelect
          name="country"
          label="Country"
          placeholder="Select country"
          control={control}
          isRequired
        >
          <option value="us">United States</option>
          <option value="ca">Canada</option>
          <option value="uk">United Kingdom</option>
        </FormSelect>

        <FormSelect
          name="state"
          label="State/Province"
          placeholder="Select state"
          control={control}
        >
          <option value="ca">California</option>
          <option value="ny">New York</option>
          <option value="tx">Texas</option>
        </FormSelect>

        <FormSelect
          name="city"
          label="City"
          placeholder="Select city"
          control={control}
        >
          <option value="sf">San Francisco</option>
          <option value="la">Los Angeles</option>
          <option value="sd">San Diego</option>
        </FormSelect>

        <FormSelect
          name="timezone"
          label="Timezone"
          control={control}
          isRequired
        >
          <option value="pst">PST (UTC-8)</option>
          <option value="mst">MST (UTC-7)</option>
          <option value="cst">CST (UTC-6)</option>
          <option value="est">EST (UTC-5)</option>
        </FormSelect>

        <button
          type="submit"
          className="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Save Settings
        </button>
      </form>
    );
  },
};

/**
 * Many options example
 */
export const ManyOptions: Story = {
  args: {
    children: <></>,
    name: 'select',
  },
  render: () => (
    <FormSelect name="year" label="Birth Year" placeholder="Select year">
      {Array.from({ length: 100 }, (_, i) => {
        const year = 2024 - i;
        return (
          <option key={year} value={year}>
            {year}
          </option>
        );
      })}
    </FormSelect>
  ),
};

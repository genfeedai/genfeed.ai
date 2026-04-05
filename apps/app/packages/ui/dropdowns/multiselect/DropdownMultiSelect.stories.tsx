import { DropdownDirection } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import DropdownMultiSelect from '@ui/dropdowns/multiselect/DropdownMultiSelect';
import { useState } from 'react';
import { FaFilter } from 'react-icons/fa';

/**
 * DropdownMultiSelect component provides a multi-select dropdown
 * with checkboxes and select all functionality.
 */
const meta = {
  argTypes: {
    direction: {
      control: 'select',
      description: 'Dropdown direction',
      options: ['up', 'down'],
    },
    name: {
      control: 'text',
      description: 'Field name',
    },
    onChange: {
      action: 'values changed',
      description: 'Callback when selection changes',
    },
    options: {
      control: 'object',
      description: 'Available options array',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    values: {
      control: 'object',
      description: 'Selected values array',
    },
  },
  component: DropdownMultiSelect,
  parameters: {
    docs: {
      description: {
        component:
          'Multi-select dropdown component with checkboxes and select all option.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Dropdowns/DropdownMultiSelect',
} satisfies Meta<typeof DropdownMultiSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default multi-select dropdown
 */
export const Default: Story = {
  args: {
    direction: DropdownDirection.DOWN,
    name: 'filters',
    onChange: (_name: string, _values: string[]) => {
      // Values changed
    },
    options: [
      { label: 'Option 1', value: 'option1' },
      { label: 'Option 2', value: 'option2' },
      { label: 'Option 3', value: 'option3' },
    ],
    placeholder: 'Select...',
    values: [],
  },
};

/**
 * With selected values
 */
export const WithSelections: Story = {
  args: {
    direction: DropdownDirection.DOWN,
    name: 'filters',
    onChange: (_name: string, _values: string[]) => {
      // Values changed
    },
    options: [
      { label: 'Option 1', value: 'option1' },
      { label: 'Option 2', value: 'option2' },
      { label: 'Option 3', value: 'option3' },
      { label: 'Option 4', value: 'option4' },
    ],
    placeholder: 'Select...',
    values: ['option1', 'option2'],
  },
};

/**
 * With icon
 */
export const WithIcon: Story = {
  args: {
    name: 'filters',
    onChange: () => {},
    options: [],
    values: [],
  },
  render: () => (
    <DropdownMultiSelect
      name="filters"
      values={[]}
      options={[
        { label: 'Option 1', value: 'option1' },
        { label: 'Option 2', value: 'option2' },
        { label: 'Option 3', value: 'option3' },
      ]}
      onChange={(_name: string, _values: string[]) => {
        // Values changed
      }}
      placeholder="Filter"
      icon={<FaFilter size={16} />}
      direction={DropdownDirection.DOWN}
    />
  ),
};

/**
 * Many options
 */
export const ManyOptions: Story = {
  args: {
    direction: DropdownDirection.DOWN,
    name: 'categories',
    onChange: (_name: string, _values: string[]) => {
      // Values changed
    },
    options: [
      { label: 'Category 1', value: 'cat1' },
      { label: 'Category 2', value: 'cat2' },
      { label: 'Category 3', value: 'cat3' },
      { label: 'Category 4', value: 'cat4' },
      { label: 'Category 5', value: 'cat5' },
      { label: 'Category 6', value: 'cat6' },
      { label: 'Category 7', value: 'cat7' },
      { label: 'Category 8', value: 'cat8' },
    ],
    placeholder: 'Select categories...',
    values: [],
  },
};

/**
 * Interactive example
 */
export const Interactive: Story = {
  args: {
    name: 'interactive',
    onChange: () => {},
    options: [],
    values: [],
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [values, setValues] = useState<string[]>([]);

    return (
      <div className="p-8">
        <DropdownMultiSelect
          name="interactive"
          values={values}
          options={[
            { label: 'React', value: 'react' },
            { label: 'Vue', value: 'vue' },
            { label: 'Angular', value: 'angular' },
            { label: 'Svelte', value: 'svelte' },
          ]}
          onChange={(_name, newValues) => setValues(newValues)}
          placeholder="Select frameworks..."
        />
        <div className="mt-4 text-sm text-gray-600">
          Selected: {values.join(', ') || 'None'}
        </div>
      </div>
    );
  },
};

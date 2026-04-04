import type { Meta, StoryObj } from '@storybook/nextjs';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import { useState } from 'react';
import { FiCalendar, FiClock, FiFilter, FiTrendingUp } from 'react-icons/fi';

/**
 * ButtonDropdown component for selecting from a list of options.
 * Displays selected value and opens dropdown on click.
 */
const meta = {
  argTypes: {
    name: {
      control: 'text',
      description: 'Button name attribute',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder when no value selected',
    },
  },
  component: ButtonDropdown,
  decorators: [
    (Story) => (
      <div className="w-96 h-64">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A dropdown button component that displays options in a popover when clicked.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Buttons/ButtonDropdown',
} satisfies Meta<typeof ButtonDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default dropdown
 */
export const Default: Story = {
  args: {
    name: 'default',
    onChange: () => {},
    options: [],
    value: '',
  },
  render: () => {
    const [value, setValue] = useState('');

    const options = [
      { label: 'Option 1', value: '1' },
      { label: 'Option 2', value: '2' },
      { label: 'Option 3', value: '3' },
    ];

    return (
      <ButtonDropdown
        name="default"
        value={value}
        options={options}
        onChange={(_, val) => setValue(val)}
        placeholder="Select an option"
      />
    );
  },
};

/**
 * Dropdown with icons
 */
export const WithIcons: Story = {
  args: {
    name: 'timeRange',
    onChange: () => {},
    options: [],
    value: '',
  },
  render: () => {
    const [value, setValue] = useState('');

    const options = [
      { icon: <FiClock size={16} />, label: 'Today', value: 'today' },
      {
        icon: <FiCalendar size={16} />,
        label: 'This Week',
        value: 'week',
      },
      {
        icon: <FiTrendingUp size={16} />,
        label: 'This Month',
        value: 'month',
      },
    ];

    return (
      <ButtonDropdown
        name="timeRange"
        value={value}
        options={options}
        onChange={(_, val) => setValue(val)}
        placeholder="Select time range"
      />
    );
  },
};

/**
 * Dropdown with initial value
 */
export const WithInitialValue: Story = {
  args: {
    name: 'priority',
    onChange: () => {},
    options: [],
    value: 'medium',
  },
  render: () => {
    const [value, setValue] = useState('medium');

    const options = [
      { label: 'Low Priority', value: 'low' },
      { label: 'Medium Priority', value: 'medium' },
      { label: 'High Priority', value: 'high' },
    ];

    return (
      <ButtonDropdown
        name="priority"
        value={value}
        options={options}
        onChange={(_, val) => setValue(val)}
      />
    );
  },
};

/**
 * Filter dropdown example
 */
export const FilterExample: Story = {
  args: {
    name: 'filter',
    onChange: () => {},
    options: [],
    value: '',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [status, setStatus] = useState('all');
    const [priority, setPriority] = useState('');

    const statusOptions = [
      { label: 'All Status', value: 'all' },
      { label: 'Active', value: 'active' },
      { label: 'Pending', value: 'pending' },
      { label: 'Completed', value: 'completed' },
    ];

    const priorityOptions = [
      { label: 'Low', value: 'low' },
      { label: 'Medium', value: 'medium' },
      { label: 'High', value: 'high' },
    ];

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FiFilter className="text-foreground/70" />
          <span className="text-sm text-foreground/70">Filters:</span>
        </div>

        <div className="flex gap-2">
          <ButtonDropdown
            name="status"
            value={status}
            options={statusOptions}
            onChange={(_, val) => setStatus(val)}
            placeholder="Status"
          />

          <ButtonDropdown
            name="priority"
            value={priority}
            options={priorityOptions}
            onChange={(_, val) => setPriority(val)}
            placeholder="Priority"
          />
        </div>

        <div className="text-sm text-foreground/70 pt-4 border-t border-white/[0.08]">
          <div>
            Status: <code className="bg-background px-2 py-1">{status}</code>
          </div>
          <div className="mt-1">
            Priority:{' '}
            <code className="bg-background px-2 py-1">{priority || 'All'}</code>
          </div>
        </div>
      </div>
    );
  },
};

/**
 * Sort dropdown
 */
export const SortDropdown: Story = {
  args: {
    name: 'sort',
    onChange: () => {},
    options: [],
    value: 'date',
  },
  render: () => {
    const [sortBy, setSortBy] = useState('date');

    const sortOptions = [
      { label: 'Sort by Date', value: 'date' },
      { label: 'Sort by Name', value: 'name' },
      { label: 'Sort by Popularity', value: 'popularity' },
      { label: 'Sort by Rating', value: 'rating' },
    ];

    return (
      <div className="space-y-4">
        <ButtonDropdown
          name="sort"
          value={sortBy}
          options={sortOptions}
          onChange={(_, val) => setSortBy(val)}
          placeholder="Sort by..."
        />

        <div className="text-sm text-foreground/70">
          Current sort:{' '}
          <code className="bg-background px-2 py-1">{sortBy}</code>
        </div>
      </div>
    );
  },
};

/**
 * Many options
 */
export const ManyOptions: Story = {
  args: {
    name: 'many',
    onChange: () => {},
    options: [],
    value: '',
  },
  render: () => {
    const [value, setValue] = useState('');

    const options = Array.from({ length: 20 }, (_, i) => ({
      label: `Option ${i + 1}`,
      value: `option-${i + 1}`,
    }));

    return (
      <div className="space-y-4">
        <ButtonDropdown
          name="many"
          value={value}
          options={options}
          onChange={(_, val) => setValue(val)}
          placeholder="Select from many options"
        />

        <div className="text-sm text-foreground/70">
          Selected:{' '}
          <code className="bg-background px-2 py-1">{value || 'None'}</code>
        </div>
      </div>
    );
  },
};

/**
 * Multiple dropdowns
 */
export const MultipleDropdowns: Story = {
  args: {
    name: 'multiple',
    onChange: () => {},
    options: [],
    value: '',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [filters, setFilters] = useState({
      category: '',
      date: '',
      status: '',
    });

    const updateFilter =
      (key: keyof typeof filters) => (_: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
      };

    const categoryOptions = [
      { label: 'Bug', value: 'bug' },
      { label: 'Feature', value: 'feature' },
      { label: 'Improvement', value: 'improvement' },
    ];

    const statusOptions = [
      { label: 'Open', value: 'open' },
      { label: 'In Progress', value: 'in-progress' },
      { label: 'Closed', value: 'closed' },
    ];

    const dateOptions = [
      { label: 'Today', value: 'today' },
      { label: 'This Week', value: 'week' },
      { label: 'This Month', value: 'month' },
    ];

    return (
      <div className="space-y-4">
        <h4 className="font-semibold">Issue Filters</h4>

        <div className="flex flex-wrap gap-2">
          <ButtonDropdown
            name="category"
            value={filters.category}
            options={categoryOptions}
            onChange={updateFilter('category')}
            placeholder="Category"
          />

          <ButtonDropdown
            name="status"
            value={filters.status}
            options={statusOptions}
            onChange={updateFilter('status')}
            placeholder="Status"
          />

          <ButtonDropdown
            name="date"
            value={filters.date}
            options={dateOptions}
            onChange={updateFilter('date')}
            placeholder="Date"
          />
        </div>

        <div className="pt-4 border-t border-white/[0.08]">
          <pre className="text-xs bg-background p-3">
            {JSON.stringify(filters, null, 2)}
          </pre>
        </div>
      </div>
    );
  },
};

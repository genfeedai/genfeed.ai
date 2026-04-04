import type { Meta, StoryObj } from '@storybook/nextjs';
import FormDropdown from '@ui/forms/selectors/dropdown/form-dropdown/FormDropdown';
import { useState } from 'react';
import { FiFilter, FiSettings, FiUser } from 'react-icons/fi';

/**
 * FormDropdown component with search, multi-column layout, and badge support.
 * Uses the options prop with optional tabs/search.
 */
const meta = {
  argTypes: {
    isDisabled: {
      control: 'boolean',
      description: 'Disables dropdown',
    },
    isFullWidth: {
      control: 'boolean',
      description: 'Makes dropdown full width',
    },
    isNoneEnabled: {
      control: 'boolean',
      description: 'Shows "None" option to clear selection',
    },
    isRequired: {
      control: 'boolean',
      description: 'Marks as required',
    },
    isSearchEnabled: {
      control: 'boolean',
      description: 'Enables search functionality',
    },
    name: {
      control: 'text',
      description: 'Dropdown name',
    },
    placeholder: {
      control: 'text',
      description: 'Search placeholder text',
    },
  },
  component: FormDropdown,
  decorators: [
    (Story) => (
      <div className="w-[500px] min-h-96">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A feature-rich dropdown component with search, multi-column layout, icons, badges, and tab filtering.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Forms/FormDropdown',
} satisfies Meta<typeof FormDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Basic dropdown with options
 */
export const Default: Story = {
  args: {
    name: 'dropdown',
    onChange: () => {},
    options: [],
    value: '',
  },
  render: () => {
    const [value, setValue] = useState('');

    const options = [
      { description: 'First option', key: '1', label: 'Option 1' },
      { description: 'Second option', key: '2', label: 'Option 2' },
      { description: 'Third option', key: '3', label: 'Option 3' },
    ];

    return (
      <FormDropdown
        name="default"
        label="Select Option"
        value={value}
        onChange={(e) => setValue(e.target.value as string)}
        options={options}
      />
    );
  },
};

/**
 * Dropdown with search
 */
export const WithSearch: Story = {
  args: {
    name: 'dropdown',
    onChange: () => {},
    options: [],
    value: '',
  },
  render: () => {
    const [value, setValue] = useState('');

    const options = [
      {
        description: 'A JavaScript library for building user interfaces',
        key: 'react',
        label: 'React',
      },
      {
        description: 'The Progressive JavaScript Framework',
        key: 'vue',
        label: 'Vue',
      },
      {
        description: 'Platform for building mobile and desktop web apps',
        key: 'angular',
        label: 'Angular',
      },
      {
        description: 'Cybernetically enhanced web apps',
        key: 'svelte',
        label: 'Svelte',
      },
      {
        description: 'Simple and performant reactivity',
        key: 'solid',
        label: 'Solid',
      },
      {
        description: 'The React Framework for Production',
        key: 'next',
        label: 'Next.js',
      },
      {
        description: 'The Intuitive Vue Framework',
        key: 'nuxt',
        label: 'Nuxt',
      },
    ];

    return (
      <FormDropdown
        name="framework"
        label="Framework"
        value={value}
        onChange={(e) => setValue(e.target.value as string)}
        options={options}
        isSearchEnabled
        placeholder="Search frameworks..."
      />
    );
  },
};

/**
 * Dropdown with icons
 */
export const WithIcons: Story = {
  args: {
    name: 'dropdown',
    onChange: () => {},
    options: [],
    value: '',
  },
  render: () => {
    const [value, setValue] = useState('');

    const options = [
      {
        description: 'Manage your profile',
        key: 'user',
        label: 'User Settings',
      },
      { description: 'Account preferences', key: 'account', label: 'Account' },
      { description: 'Privacy settings', key: 'privacy', label: 'Privacy' },
    ];

    return (
      <FormDropdown
        name="settings"
        label="Settings"
        value={value}
        onChange={(e) => setValue(e.target.value as string)}
        options={options}
        icon={<FiSettings />}
      />
    );
  },
};

/**
 * Dropdown with badges
 */
export const WithBadges: Story = {
  args: {
    name: 'dropdown',
    onChange: () => {},
    options: [],
    value: '',
  },
  render: () => {
    const [value, setValue] = useState('');

    const options = [
      {
        badge: 'Current',
        badgeVariant: 'info' as const,
        description: 'Basic features for individuals',
        key: 'free',
        label: 'Free Plan',
      },
      {
        badge: 'Popular',
        badgeVariant: 'success' as const,
        description: 'Advanced features for professionals',
        key: 'pro',
        label: 'Pro Plan',
      },
      {
        badge: 'New',
        badgeVariant: 'warning' as const,
        description: 'Custom solutions for teams',
        key: 'enterprise',
        label: 'Enterprise Plan',
      },
    ];

    return (
      <FormDropdown
        name="plan"
        label="Subscription"
        value={value}
        onChange={(e) => setValue(e.target.value as string)}
        options={options}
      />
    );
  },
};

/**
 * Dropdown with None option
 */
export const WithNoneOption: Story = {
  args: {
    name: 'dropdown',
    onChange: () => {},
    options: [],
    value: '',
  },
  render: () => {
    const [value, setValue] = useState('react');

    const options = [
      { description: 'JavaScript library', key: 'react', label: 'React' },
      { description: 'Progressive framework', key: 'vue', label: 'Vue' },
      {
        description: 'Platform for web apps',
        key: 'angular',
        label: 'Angular',
      },
    ];

    return (
      <div className="space-y-4">
        <FormDropdown
          name="framework"
          label="Framework"
          value={value}
          onChange={(e) => setValue(e.target.value as string)}
          options={options}
          isNoneEnabled
        />

        <div className="text-sm text-foreground/70">
          Selected:{' '}
          <code className="bg-background px-2 py-1">{value || '(none)'}</code>
        </div>
      </div>
    );
  },
};

/**
 * Disabled dropdown
 */
export const Disabled: Story = {
  args: {
    name: 'dropdown',
    onChange: () => {},
    options: [],
    value: '',
  },
  render: () => {
    const options = [
      { description: 'First option', key: '1', label: 'Option 1' },
      { description: 'Second option', key: '2', label: 'Option 2' },
    ];

    return (
      <FormDropdown
        name="disabled"
        label="Disabled"
        value="1"
        onChange={() => {}}
        options={options}
        isDisabled
      />
    );
  },
};

/**
 * Not full width
 */
export const NotFullWidth: Story = {
  args: {
    name: 'dropdown',
    onChange: () => {},
    options: [],
    value: '',
  },
  render: () => {
    const [value, setValue] = useState('');

    const options = [
      { description: '640px', key: 'sm', label: 'Small' },
      { description: '768px', key: 'md', label: 'Medium' },
      { description: '1024px', key: 'lg', label: 'Large' },
    ];

    return (
      <FormDropdown
        name="size"
        label="Size"
        value={value}
        onChange={(e) => setValue(e.target.value as string)}
        options={options}
        isFullWidth={false}
      />
    );
  },
};

/**
 * Dropdown opens upward
 */
export const OpenUpward: Story = {
  args: {
    name: 'dropdown',
    onChange: () => {},
    options: [],
    value: '',
  },
  render: () => {
    const [value, setValue] = useState('');

    const options = [
      { description: 'First option', key: '1', label: 'Option 1' },
      { description: 'Second option', key: '2', label: 'Option 2' },
      { description: 'Third option', key: '3', label: 'Option 3' },
    ];

    return (
      <FormDropdown
        name="upward"
        label="Opens Up"
        value={value}
        onChange={(e) => setValue(e.target.value as string)}
        options={options}
        dropdownDirection="up"
      />
    );
  },
};

/**
 * Large list with search
 */
export const LargeList: Story = {
  args: {
    name: 'dropdown',
    onChange: () => {},
    options: [],
    value: '',
  },
  render: () => {
    const [value, setValue] = useState('');

    const countries = [
      'United States',
      'Canada',
      'United Kingdom',
      'Australia',
      'Germany',
      'France',
      'Spain',
      'Italy',
      'Netherlands',
      'Belgium',
      'Switzerland',
      'Austria',
      'Sweden',
      'Norway',
      'Denmark',
      'Finland',
      'Poland',
      'Czech Republic',
      'Portugal',
      'Greece',
      'Ireland',
      'New Zealand',
      'Japan',
      'South Korea',
      'Singapore',
      'Hong Kong',
      'India',
    ];

    const options = countries.map((country, i) => ({
      description: `Code: ${country.substring(0, 2).toUpperCase()}`,
      key: String(i),
      label: country,
    }));

    return (
      <FormDropdown
        name="country"
        label="Country"
        value={value}
        onChange={(e) => setValue(e.target.value as string)}
        options={options}
        isSearchEnabled
        placeholder="Search countries..."
      />
    );
  },
};

/**
 * Filter dropdown example
 */
export const FilterExample: Story = {
  args: {
    name: 'dropdown',
    onChange: () => {},
    options: [],
    value: '',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [status, setStatus] = useState('');
    const [priority, setPriority] = useState('');

    const statusOptions = [
      {
        badge: '12',
        badgeVariant: 'success' as const,
        description: 'Currently active items',
        key: 'active',
        label: 'Active',
      },
      {
        badge: '5',
        badgeVariant: 'warning' as const,
        description: 'Awaiting approval',
        key: 'pending',
        label: 'Pending',
      },
      {
        badge: '45',
        badgeVariant: 'info' as const,
        description: 'Finished items',
        key: 'completed',
        label: 'Completed',
      },
      {
        badge: '120',
        badgeVariant: 'secondary' as const,
        description: 'Old items',
        key: 'archived',
        label: 'Archived',
      },
    ];

    const priorityOptions = [
      { description: 'Can wait', key: 'low', label: 'Low' },
      { description: 'Standard priority', key: 'medium', label: 'Medium' },
      { description: 'Important', key: 'high', label: 'High' },
      {
        description: 'Needs immediate attention',
        key: 'urgent',
        label: 'Urgent',
      },
    ];

    return (
      <div className="space-y-4">
        <h4 className="font-semibold">Filters</h4>

        <FormDropdown
          name="status"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as string)}
          options={statusOptions}
          icon={<FiFilter />}
          isNoneEnabled
        />

        <FormDropdown
          name="priority"
          label="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as string)}
          options={priorityOptions}
          icon={<FiFilter />}
          isNoneEnabled
        />

        <div className="pt-4 border-t border-white/[0.08]">
          <div className="text-sm text-foreground/70">
            <div>
              Status:{' '}
              <code className="bg-background px-2 py-1">{status || 'All'}</code>
            </div>
            <div className="mt-1">
              Priority:{' '}
              <code className="bg-background px-2 py-1">
                {priority || 'All'}
              </code>
            </div>
          </div>
        </div>
      </div>
    );
  },
};

/**
 * User selector
 */
export const UserSelector: Story = {
  args: {
    name: 'dropdown',
    onChange: () => {},
    options: [],
    value: '',
  },
  render: () => {
    const [user, setUser] = useState('');

    const users = [
      {
        badge: 'Admin',
        badgeVariant: 'error' as const,
        description: 'john@example.com',
        key: '1',
        label: 'John Doe',
      },
      {
        badge: 'Editor',
        badgeVariant: 'warning' as const,
        description: 'jane@example.com',
        key: '2',
        label: 'Jane Smith',
      },
      {
        badge: 'Viewer',
        badgeVariant: 'info' as const,
        description: 'bob@example.com',
        key: '3',
        label: 'Bob Johnson',
      },
      {
        badge: 'Editor',
        badgeVariant: 'warning' as const,
        description: 'alice@example.com',
        key: '4',
        label: 'Alice Williams',
      },
      {
        badge: 'Viewer',
        badgeVariant: 'info' as const,
        description: 'charlie@example.com',
        key: '5',
        label: 'Charlie Brown',
      },
    ];

    return (
      <FormDropdown
        name="user"
        label="Assign To"
        value={user}
        onChange={(e) => setUser(e.target.value as string)}
        options={users}
        icon={<FiUser />}
        isSearchEnabled
        placeholder="Search users..."
      />
    );
  },
};

/**
 * Complex form example
 */
export const FormExample: Story = {
  args: {
    name: 'dropdown',
    onChange: () => {},
    options: [],
    value: '',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [formData, setFormData] = useState({
      assignee: '',
      category: '',
      priority: '',
      subcategory: '',
    });

    const updateField = (field: keyof typeof formData) => (e: any) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    };

    const categories = [
      {
        description: "Something isn't working",
        key: 'bug',
        label: 'Bug Report',
      },
      {
        description: 'Suggest a new feature',
        key: 'feature',
        label: 'Feature Request',
      },
      {
        description: 'Enhance existing feature',
        key: 'improvement',
        label: 'Improvement',
      },
      { description: 'General inquiry', key: 'question', label: 'Question' },
    ];

    const subcategories = [
      { description: 'User interface issues', key: 'ui', label: 'UI/UX' },
      {
        description: 'Speed and optimization',
        key: 'performance',
        label: 'Performance',
      },
      { description: 'Security concerns', key: 'security', label: 'Security' },
      { description: 'API-related', key: 'api', label: 'API' },
    ];

    const priorities = [
      {
        badge: '3-7 days',
        badgeVariant: 'info' as const,
        description: 'Can wait',
        key: 'low',
        label: 'Low',
      },
      {
        badge: '1-3 days',
        badgeVariant: 'warning' as const,
        description: 'Standard',
        key: 'medium',
        label: 'Medium',
      },
      {
        badge: '< 1 day',
        badgeVariant: 'error' as const,
        description: 'Important',
        key: 'high',
        label: 'High',
      },
    ];

    const assignees = [
      {
        badge: '3 tasks',
        badgeVariant: 'info' as const,
        description: 'Frontend Dev',
        key: '1',
        label: 'John Doe',
      },
      {
        badge: '1 task',
        badgeVariant: 'success' as const,
        description: 'Backend Dev',
        key: '2',
        label: 'Jane Smith',
      },
      {
        badge: '5 tasks',
        badgeVariant: 'warning' as const,
        description: 'DevOps',
        key: '3',
        label: 'Bob Johnson',
      },
    ];

    return (
      <div className="space-y-4">
        <h4 className="font-semibold">Create Ticket</h4>

        <FormDropdown
          name="category"
          label="Category"
          value={formData.category}
          onChange={updateField('category')}
          options={categories}
          isRequired
        />

        <FormDropdown
          name="subcategory"
          label="Subcategory"
          value={formData.subcategory}
          onChange={updateField('subcategory')}
          options={subcategories}
          isSearchEnabled
          placeholder="Search subcategories..."
        />

        <FormDropdown
          name="priority"
          label="Priority"
          value={formData.priority}
          onChange={updateField('priority')}
          options={priorities}
          isRequired
        />

        <FormDropdown
          name="assignee"
          label="Assign To"
          value={formData.assignee}
          onChange={updateField('assignee')}
          options={assignees}
          icon={<FiUser />}
          isSearchEnabled
          isNoneEnabled
          placeholder="Search team members..."
        />

        <div className="pt-4 border-t border-white/[0.08]">
          <pre className="text-xs bg-background p-3">
            {JSON.stringify(formData, null, 2)}
          </pre>
        </div>
      </div>
    );
  },
};

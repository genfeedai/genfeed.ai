import { ViewType } from '@genfeedai/contracts';
import type { Meta, StoryObj } from '@storybook/nextjs';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { Calendar, LayoutGrid, List, Table } from 'lucide-react';
import { useState } from 'react';

/**
 * ViewToggle component for switching between different view types.
 * Uses a tab-style interface with icons and tooltips.
 */
const meta = {
  argTypes: {
    activeView: {
      control: 'text',
      description: 'Currently active view type',
    },
    className: {
      control: 'text',
      description: 'Additional CSS classes',
    },
    onChange: {
      action: 'view changed',
      description: 'Callback when view is changed',
    },
    options: {
      control: 'object',
      description: 'Array of view options with type, icon, and label',
    },
  },
  component: ViewToggle,
  parameters: {
    docs: {
      description: {
        component:
          'Tab-style component for switching between different view types. Commonly used for toggling between list, calendar, and grid views.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/UI/ViewToggle',
} satisfies Meta<typeof ViewToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Basic view toggle with list and calendar views
 */
export const Basic: Story = {
  args: {
    activeView: ViewType.LIST,
    onChange: () => {},
    options: [],
  },
  render: () => {
    const [activeView, setActiveView] = useState<ViewType>(ViewType.LIST);
    return (
      <ViewToggle
        options={[
          {
            icon: <List />,
            label: 'List View',
            type: ViewType.LIST,
          },
          {
            icon: <Calendar />,
            label: 'Calendar View',
            type: ViewType.CALENDAR,
          },
        ]}
        activeView={activeView}
        onChange={setActiveView}
      />
    );
  },
};

/**
 * View toggle with three options
 */
export const ThreeViews: Story = {
  args: {
    activeView: ViewType.LIST,
    onChange: () => {},
    options: [],
  },
  render: () => {
    const [activeView, setActiveView] = useState<ViewType>(ViewType.LIST);
    return (
      <ViewToggle
        options={[
          {
            icon: <List />,
            label: 'List View',
            type: ViewType.LIST,
          },
          {
            icon: <Calendar />,
            label: 'Calendar View',
            type: ViewType.CALENDAR,
          },
          {
            icon: <LayoutGrid />,
            label: 'Grid View',
            type: ViewType.GRID,
          },
        ]}
        activeView={activeView}
        onChange={setActiveView}
      />
    );
  },
};

/**
 * View toggle with four options
 */
export const FourViews: Story = {
  args: {
    activeView: ViewType.LIST,
    onChange: () => {},
    options: [],
  },
  render: () => {
    const [activeView, setActiveView] = useState<ViewType>(ViewType.LIST);
    return (
      <ViewToggle
        options={[
          {
            icon: <List />,
            label: 'List View',
            type: ViewType.LIST,
          },
          {
            icon: <Calendar />,
            label: 'Calendar View',
            type: ViewType.CALENDAR,
          },
          {
            icon: <LayoutGrid />,
            label: 'Grid View',
            type: ViewType.GRID,
          },
          {
            icon: <Table />,
            label: 'Table View',
            type: ViewType.TABLE,
          },
        ]}
        activeView={activeView}
        onChange={setActiveView}
      />
    );
  },
};

/**
 * View toggle with custom aria labels
 */
export const WithAriaLabels: Story = {
  args: {
    activeView: ViewType.LIST,
    onChange: () => {},
    options: [],
  },
  render: () => {
    const [activeView, setActiveView] = useState<ViewType>(ViewType.LIST);
    return (
      <ViewToggle
        options={[
          {
            ariaLabel: 'Switch to list view',
            icon: <List />,
            label: 'List View',
            type: ViewType.LIST,
          },
          {
            ariaLabel: 'Switch to calendar view',
            icon: <Calendar />,
            label: 'Calendar View',
            type: ViewType.CALENDAR,
          },
        ]}
        activeView={activeView}
        onChange={setActiveView}
      />
    );
  },
};

/**
 * View toggle with content
 */
export const WithContent: Story = {
  args: {
    activeView: ViewType.LIST,
    onChange: () => {},
    options: [],
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [activeView, setActiveView] = useState<ViewType>(ViewType.LIST);

    return (
      <div className="space-y-6 w-full max-w-2xl">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-lg">Posts</h3>
          <ViewToggle
            options={[
              {
                icon: <List />,
                label: 'List View',
                type: ViewType.LIST,
              },
              {
                icon: <Calendar />,
                label: 'Calendar View',
                type: ViewType.CALENDAR,
              },
              {
                icon: <LayoutGrid />,
                label: 'Grid View',
                type: ViewType.GRID,
              },
            ]}
            activeView={activeView}
            onChange={setActiveView}
          />
        </div>

        <div className=" border border-white/[0.08] bg-background p-6 min-h-96">
          {activeView === ViewType.LIST && (
            <div>
              <h4 className="font-semibold mb-4">List View</h4>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((placeholderId) => (
                  <div key={placeholderId} className="p-3 bg-card">
                    Post #{placeholderId}
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeView === ViewType.CALENDAR && (
            <div>
              <h4 className="font-semibold mb-4">Calendar View</h4>
              <p className="text-foreground/70">
                Calendar view would be displayed here
              </p>
            </div>
          )}
          {activeView === ViewType.GRID && (
            <div>
              <h4 className="font-semibold mb-4">Grid View</h4>
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((placeholderId) => (
                  <div key={placeholderId} className="p-6 bg-card text-center">
                    Post #{placeholderId}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
};

/**
 * Compact view toggle
 */
export const Compact: Story = {
  args: {
    activeView: ViewType.LIST,
    onChange: () => {},
    options: [],
  },
  render: () => {
    const [activeView, setActiveView] = useState<ViewType>(ViewType.LIST);
    return (
      <ViewToggle
        options={[
          {
            icon: <List className="text-sm" />,
            label: 'List',
            type: ViewType.LIST,
          },
          {
            icon: <LayoutGrid className="text-sm" />,
            label: 'Grid',
            type: ViewType.GRID,
          },
        ]}
        activeView={activeView}
        onChange={setActiveView}
        className="h-8"
      />
    );
  },
};

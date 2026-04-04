import { ViewType } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { useState } from 'react';
import {
  HiCalendar,
  HiListBullet,
  HiSquares2X2,
  HiTableCells,
} from 'react-icons/hi2';

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
            icon: <HiListBullet />,
            label: 'List View',
            type: ViewType.LIST,
          },
          {
            icon: <HiCalendar />,
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
            icon: <HiListBullet />,
            label: 'List View',
            type: ViewType.LIST,
          },
          {
            icon: <HiCalendar />,
            label: 'Calendar View',
            type: ViewType.CALENDAR,
          },
          {
            icon: <HiSquares2X2 />,
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
            icon: <HiListBullet />,
            label: 'List View',
            type: ViewType.LIST,
          },
          {
            icon: <HiCalendar />,
            label: 'Calendar View',
            type: ViewType.CALENDAR,
          },
          {
            icon: <HiSquares2X2 />,
            label: 'Grid View',
            type: ViewType.GRID,
          },
          {
            icon: <HiTableCells />,
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
            icon: <HiListBullet />,
            label: 'List View',
            type: ViewType.LIST,
          },
          {
            ariaLabel: 'Switch to calendar view',
            icon: <HiCalendar />,
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
          <h3 className="font-bold text-lg">Posts</h3>
          <ViewToggle
            options={[
              {
                icon: <HiListBullet />,
                label: 'List View',
                type: ViewType.LIST,
              },
              {
                icon: <HiCalendar />,
                label: 'Calendar View',
                type: ViewType.CALENDAR,
              },
              {
                icon: <HiSquares2X2 />,
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
              <h4 className="font-bold mb-4">List View</h4>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="p-3 bg-card">
                    Post #{i}
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeView === ViewType.CALENDAR && (
            <div>
              <h4 className="font-bold mb-4">Calendar View</h4>
              <p className="text-foreground/70">
                Calendar view would be displayed here
              </p>
            </div>
          )}
          {activeView === ViewType.GRID && (
            <div>
              <h4 className="font-bold mb-4">Grid View</h4>
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="p-6 bg-card text-center">
                    Post #{i}
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
            icon: <HiListBullet className="text-sm" />,
            label: 'List',
            type: ViewType.LIST,
          },
          {
            icon: <HiSquares2X2 className="text-sm" />,
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

import type { Meta, StoryObj } from '@storybook/nextjs';
import MenuLabel from '@ui/menus/label/MenuLabel';
import { useState } from 'react';
import { FiHome, FiSettings } from 'react-icons/fi';
import {
  HiChevronDown,
  HiChevronRight,
  HiCog6Tooth,
  HiHome,
} from 'react-icons/hi2';

/**
 * MenuLabel component displays a menu section label with optional icon and chevron.
 * Used for collapsible menu sections and labels.
 */
const meta = {
  argTypes: {
    isActive: {
      control: 'boolean',
      description: 'Whether the label is active',
    },
    label: {
      control: 'text',
      description: 'Label text',
    },
    onClick: {
      action: 'clicked',
      description: 'Callback when label is clicked',
    },
  },
  component: MenuLabel,
  parameters: {
    docs: {
      description: {
        component:
          'Menu label component for section headers and collapsible menu groups with icon and chevron support.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Menus/MenuLabel',
} satisfies Meta<typeof MenuLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default menu label
 */
export const Default: Story = {
  args: {
    isActive: false,
    label: 'Navigation',
    outline: FiHome,
    solid: HiHome,
  },
};

/**
 * Active menu label
 */
export const Active: Story = {
  args: {
    isActive: true,
    label: 'Settings',
    outline: FiSettings,
    solid: HiCog6Tooth,
  },
};

/**
 * Menu label with chevron down
 */
export const WithChevronDown: Story = {
  args: {
    label: 'Menu Label',
  },
  render: () => (
    <MenuLabel
      label="Menu Section"
      outline={FiHome}
      solid={HiHome}
      isActive={false}
      chevronIcon={<HiChevronDown className="w-4 h-4" />}
    />
  ),
};

/**
 * Menu label with chevron right
 */
export const WithChevronRight: Story = {
  args: {
    label: 'Menu Label',
  },
  render: () => (
    <MenuLabel
      label="Collapsed Section"
      outline={FiSettings}
      solid={HiCog6Tooth}
      isActive={false}
      chevronIcon={<HiChevronRight className="w-4 h-4" />}
    />
  ),
};

/**
 * Menu label without icon
 */
export const WithoutIcon: Story = {
  args: {
    isActive: false,
    label: 'Section Label',
  },
};

/**
 * Menu labels in context
 */
export const InMenu: Story = {
  args: {
    label: 'Menu Label',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <ul className="list-none bg-background p-2 w-64">
      <MenuLabel
        label="Main Navigation"
        outline={FiHome}
        solid={HiHome}
        isActive={true}
        chevronIcon={<HiChevronDown className="w-4 h-4" />}
      />
      <MenuLabel
        label="Settings"
        outline={FiSettings}
        solid={HiCog6Tooth}
        isActive={false}
        chevronIcon={<HiChevronRight className="w-4 h-4" />}
      />
      <MenuLabel
        label="Other"
        isActive={false}
        chevronIcon={<HiChevronRight className="w-4 h-4" />}
      />
    </ul>
  ),
};

/**
 * Interactive collapsible example
 */
export const Interactive: Story = {
  args: {
    label: 'Menu Label',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
      <ul className="list-none bg-background p-2 w-64">
        <MenuLabel
          label="Collapsible Section"
          outline={FiHome}
          solid={HiHome}
          isActive={isExpanded}
          chevronIcon={
            isExpanded ? (
              <HiChevronDown className="w-4 h-4" />
            ) : (
              <HiChevronRight className="w-4 h-4" />
            )
          }
          onClick={() => setIsExpanded(!isExpanded)}
        />
        {isExpanded && (
          <>
            <li className="list-none mb-1">
              <a
                href="#item-1"
                className="flex items-center gap-3 text-left px-3 py-2 transition h-9 hover:bg-primary/5"
              >
                Item 1
              </a>
            </li>
            <li className="list-none mb-1">
              <a
                href="#item-2"
                className="flex items-center gap-3 text-left px-3 py-2 transition h-9 hover:bg-primary/5"
              >
                Item 2
              </a>
            </li>
          </>
        )}
      </ul>
    );
  },
};

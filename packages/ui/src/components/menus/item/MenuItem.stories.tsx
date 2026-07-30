import type { Meta, StoryObj } from '@storybook/nextjs';
import MenuItem from '@ui/menus/item/MenuItem';
import { Bell, Home, Settings, User } from 'lucide-react';

/**
 * MenuItem component displays a navigation menu item with icon and label.
 * Supports both default and icon variants and active states.
 */
const meta = {
  argTypes: {
    href: {
      control: 'text',
      description: 'Link URL (if provided, renders as Link)',
    },
    isActive: {
      control: 'boolean',
      description: 'Whether the menu item is active',
    },
    label: {
      control: 'text',
      description: 'Menu item label',
    },
    onClick: {
      action: 'clicked',
      description: 'Callback when menu item is clicked',
    },
    variant: {
      control: 'select',
      description: 'Visual variant of the menu item',
      options: ['default', 'icon'],
    },
  },
  component: MenuItem,
  parameters: {
    docs: {
      description: {
        component:
          'Navigation menu item component with icon support, active states, and variant options.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Menus/MenuItem',
} satisfies Meta<typeof MenuItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default menu item
 */
export const Default: Story = {
  args: {
    href: '/dashboard',
    isActive: false,
    label: 'Dashboard',
    outline: Home,
    solid: Home,
    variant: 'default',
  },
};

/**
 * Active menu item
 */
export const Active: Story = {
  args: {
    href: '/dashboard',
    isActive: true,
    label: 'Dashboard',
    outline: Home,
    solid: Home,
    variant: 'default',
  },
};

/**
 * Menu item without link (with onClick)
 */
export const WithOnClick: Story = {
  args: {
    isActive: false,
    label: 'Notifications',
    onClick: () => {
      // Menu item clicked
    },
    outline: Bell,
    solid: Bell,
    variant: 'default',
  },
};

/**
 * Icon variant menu item
 */
export const IconVariant: Story = {
  args: {
    href: '/profile',
    isActive: false,
    label: 'Profile',
    outline: User,
    solid: User,
    variant: 'icon',
  },
};

/**
 * Active icon variant
 */
export const IconVariantActive: Story = {
  args: {
    href: '/profile',
    isActive: true,
    label: 'Profile',
    outline: User,
    solid: User,
    variant: 'icon',
  },
};

/**
 * Menu items in navigation context
 */
export const NavigationMenu: Story = {
  args: {
    href: '#',
    label: 'Navigation Menu',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <ul className="list-none bg-background p-2 w-64">
      <MenuItem
        href="/dashboard"
        label="Dashboard"
        outline={Home}
        solid={Home}
        isActive={true}
      />
      <MenuItem
        href="/notifications"
        label="Notifications"
        outline={Bell}
        solid={Bell}
        isActive={false}
      />
      <MenuItem
        href="/profile"
        label="Profile"
        outline={User}
        solid={User}
        isActive={false}
      />
      <MenuItem
        href="/settings"
        label="Settings"
        outline={Settings}
        solid={Settings}
        isActive={false}
      />
    </ul>
  ),
};

/**
 * Icon variant menu items
 */
export const IconMenu: Story = {
  args: {
    href: '#',
    label: 'Icon Menu',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <ul className="list-none bg-background p-2 w-80">
      <MenuItem
        href="/dashboard"
        label="Dashboard"
        outline={Home}
        solid={Home}
        isActive={true}
        variant="icon"
      />
      <MenuItem
        href="/notifications"
        label="Notifications"
        outline={Bell}
        solid={Bell}
        isActive={false}
        variant="icon"
      />
      <MenuItem
        href="/profile"
        label="Profile"
        outline={User}
        solid={User}
        isActive={false}
        variant="icon"
      />
      <MenuItem
        href="/settings"
        label="Settings"
        outline={Settings}
        solid={Settings}
        isActive={false}
        variant="icon"
      />
    </ul>
  ),
};

import type { Meta, StoryObj } from '@storybook/nextjs';
import MenuItem from '@ui/menus/item/MenuItem';
import { FiBell, FiHome, FiSettings, FiUser } from 'react-icons/fi';
import { HiBell, HiCog6Tooth, HiHome, HiUser } from 'react-icons/hi2';

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
    outline: FiHome,
    solid: HiHome,
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
    outline: FiHome,
    solid: HiHome,
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
    outline: FiBell,
    solid: HiBell,
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
    outline: FiUser,
    solid: HiUser,
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
    outline: FiUser,
    solid: HiUser,
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
        outline={FiHome}
        solid={HiHome}
        isActive={true}
      />
      <MenuItem
        href="/notifications"
        label="Notifications"
        outline={FiBell}
        solid={HiBell}
        isActive={false}
      />
      <MenuItem
        href="/profile"
        label="Profile"
        outline={FiUser}
        solid={HiUser}
        isActive={false}
      />
      <MenuItem
        href="/settings"
        label="Settings"
        outline={FiSettings}
        solid={HiCog6Tooth}
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
        outline={FiHome}
        solid={HiHome}
        isActive={true}
        variant="icon"
      />
      <MenuItem
        href="/notifications"
        label="Notifications"
        outline={FiBell}
        solid={HiBell}
        isActive={false}
        variant="icon"
      />
      <MenuItem
        href="/profile"
        label="Profile"
        outline={FiUser}
        solid={HiUser}
        isActive={false}
        variant="icon"
      />
      <MenuItem
        href="/settings"
        label="Settings"
        outline={FiSettings}
        solid={HiCog6Tooth}
        isActive={false}
        variant="icon"
      />
    </ul>
  ),
};

import { AssetScope } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import DropdownScope from '@ui/dropdowns/scope/DropdownScope';

/**
 * DropdownScope component allows users to change the scope of an item
 * (user, brand, organization) with inline editing.
 */
const meta = {
  argTypes: {
    item: {
      control: 'object',
      description: 'Item object (article or ingredient) with scope property',
    },
    onScopeChange: {
      action: 'scope changed',
      description: 'Callback when scope is updated',
    },
  },
  component: DropdownScope,
  parameters: {
    docs: {
      description: {
        component:
          'Dropdown for changing item scope (user, brand, organization).',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Dropdowns/DropdownScope',
} satisfies Meta<typeof DropdownScope>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default scope dropdown
 */
export const Default: Story = {
  args: {
    item: {
      id: '1',
      scope: AssetScope.USER,
    } as any,
    onScopeChange: async () => {
      // Scope changed
    },
  },
};

/**
 * Brand scope
 */
export const BrandScope: Story = {
  args: {
    item: {
      id: '2',
      scope: AssetScope.BRAND,
    } as any,
    onScopeChange: async () => {
      // Scope changed
    },
  },
};

/**
 * Organization scope
 */
export const OrganizationScope: Story = {
  args: {
    item: {
      id: '3',
      scope: AssetScope.ORGANIZATION,
    } as any,
    onScopeChange: async () => {
      // Scope changed
    },
  },
};

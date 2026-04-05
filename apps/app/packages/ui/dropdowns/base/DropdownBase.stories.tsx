import { ButtonVariant } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import Button from '@ui/buttons/base/Button';
import DropdownBase from '@ui/dropdowns/base/DropdownBase';
import { useState } from 'react';
import {
  FiCopy,
  FiDownload,
  FiEdit,
  FiMoreVertical,
  FiTrash2,
} from 'react-icons/fi';

/**
 * DropdownBase component provides a reusable dropdown menu with consistent styling,
 * auto-positioning, and portal support.
 */
const meta = {
  argTypes: {
    isOpen: {
      control: 'boolean',
      description: 'Controlled open state',
    },
    maxWidth: {
      control: 'text',
      description: 'Maximum width of the dropdown',
    },
    minWidth: {
      control: 'text',
      description: 'Minimum width of the dropdown',
    },
    onOpenChange: {
      action: 'open changed',
      description: 'Callback when open state changes',
    },
    position: {
      control: 'select',
      description: 'Position preference for dropdown',
      options: ['auto', 'bottom-full', 'top-full'],
    },
    trigger: {
      description: 'React element that triggers the dropdown',
    },
    usePortal: {
      control: 'boolean',
      description: 'Render dropdown in portal (avoids overflow clipping)',
    },
  },
  component: DropdownBase,
  parameters: {
    docs: {
      description: {
        component:
          'Base dropdown component with auto-positioning, portal support, and consistent styling.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Dropdowns/DropdownBase',
} satisfies Meta<typeof DropdownBase>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default dropdown with button trigger
 */
export const Default: Story = {
  args: {
    children: <div>Content</div>,
    trigger: <button>Trigger</button>,
  },
  render: () => (
    <DropdownBase
      trigger={<Button label="Open Dropdown" variant={ButtonVariant.DEFAULT} />}
    >
      <div className="space-y-1">
        <button className="w-full text-left px-3 py-2 hover:bg-background text-sm">
          Option 1
        </button>
        <button className="w-full text-left px-3 py-2 hover:bg-background text-sm">
          Option 2
        </button>
        <button className="w-full text-left px-3 py-2 hover:bg-background text-sm">
          Option 3
        </button>
      </div>
    </DropdownBase>
  ),
};

/**
 * Dropdown with icon trigger
 */
export const IconTrigger: Story = {
  args: {
    children: <div>Content</div>,
    trigger: <button>Trigger</button>,
  },
  render: () => (
    <DropdownBase
      trigger={
        <button className="h-8 px-3 inline-flex items-center justify-center hover:bg-accent hover:text-accent-foreground">
          <FiMoreVertical size={16} />
        </button>
      }
    >
      <div className="space-y-1">
        <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-background text-sm">
          <FiEdit size={16} />
          Edit
        </button>
        <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-background text-sm">
          <FiCopy size={16} />
          Copy
        </button>
        <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-background text-sm">
          <FiDownload size={16} />
          Download
        </button>
        <div className="border-t border-white/[0.08] my-1" />
        <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-background text-sm text-error">
          <FiTrash2 size={16} />
          Delete
        </button>
      </div>
    </DropdownBase>
  ),
};

/**
 * Controlled dropdown
 */
export const Controlled: Story = {
  args: {
    children: <div>Content</div>,
    trigger: <button>Trigger</button>,
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            label="Open Dropdown"
            variant={ButtonVariant.DEFAULT}
            onClick={() => setIsOpen(true)}
          />
          <Button
            label="Close Dropdown"
            variant={ButtonVariant.SECONDARY}
            onClick={() => setIsOpen(false)}
          />
        </div>
        <DropdownBase
          trigger={
            <Button label="Controlled" variant={ButtonVariant.OUTLINE} />
          }
          isOpen={isOpen}
          onOpenChange={setIsOpen}
        >
          <div className="space-y-1">
            <button className="w-full text-left px-3 py-2 hover:bg-background text-sm">
              Controlled Option 1
            </button>
            <button className="w-full text-left px-3 py-2 hover:bg-background text-sm">
              Controlled Option 2
            </button>
          </div>
        </DropdownBase>
      </div>
    );
  },
};

/**
 * Dropdown with custom width
 */
export const CustomWidth: Story = {
  args: {
    children: <div>Content</div>,
    trigger: <button>Trigger</button>,
  },
  render: () => (
    <DropdownBase
      trigger={<Button label="Wide Dropdown" variant={ButtonVariant.DEFAULT} />}
      minWidth="300px"
      maxWidth="400px"
    >
      <div className="space-y-1">
        <div className="px-3 py-2 text-sm font-semibold">Custom Width</div>
        <div className="border-t border-white/[0.08]" />
        <button className="w-full text-left px-3 py-2 hover:bg-background text-sm">
          This dropdown has a minimum width of 300px and maximum of 400px
        </button>
        <button className="w-full text-left px-3 py-2 hover:bg-background text-sm">
          Option 2
        </button>
      </div>
    </DropdownBase>
  ),
};

/**
 * Dropdown with portal (useful for overflow clipping)
 */
export const WithPortal: Story = {
  args: {
    children: <div>Content</div>,
    trigger: <button>Trigger</button>,
  },
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="p-8 border-2 border-dashed border-white/[0.08] overflow-hidden">
      <p className="text-sm text-gray-600 mb-4">
        This container has overflow hidden, but the dropdown uses a portal:
      </p>
      <DropdownBase
        trigger={
          <Button label="Portal Dropdown" variant={ButtonVariant.DEFAULT} />
        }
        usePortal={true}
      >
        <div className="space-y-1">
          <button className="w-full text-left px-3 py-2 hover:bg-background text-sm">
            Portal Option 1
          </button>
          <button className="w-full text-left px-3 py-2 hover:bg-background text-sm">
            Portal Option 2
          </button>
          <button className="w-full text-left px-3 py-2 hover:bg-background text-sm">
            Portal Option 3
          </button>
        </div>
      </DropdownBase>
    </div>
  ),
};

/**
 * Multiple dropdowns
 */
export const Multiple: Story = {
  args: {
    children: <div>Content</div>,
    trigger: <button>Trigger</button>,
  },
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="flex gap-4 p-8">
      <DropdownBase
        trigger={<Button label="Dropdown 1" variant={ButtonVariant.DEFAULT} />}
      >
        <div className="space-y-1">
          <button className="w-full text-left px-3 py-2 hover:bg-background text-sm">
            Option 1
          </button>
          <button className="w-full text-left px-3 py-2 hover:bg-background text-sm">
            Option 2
          </button>
        </div>
      </DropdownBase>

      <DropdownBase
        trigger={
          <Button label="Dropdown 2" variant={ButtonVariant.SECONDARY} />
        }
      >
        <div className="space-y-1">
          <button className="w-full text-left px-3 py-2 hover:bg-background text-sm">
            Action 1
          </button>
          <button className="w-full text-left px-3 py-2 hover:bg-background text-sm">
            Action 2
          </button>
        </div>
      </DropdownBase>

      <DropdownBase
        trigger={
          <button className="h-8 px-3 inline-flex items-center justify-center hover:bg-accent hover:text-accent-foreground">
            <FiMoreVertical size={16} />
          </button>
        }
      >
        <div className="space-y-1">
          <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-background text-sm">
            <FiEdit size={16} />
            Edit
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-background text-sm">
            <FiTrash2 size={16} />
            Delete
          </button>
        </div>
      </DropdownBase>
    </div>
  ),
};

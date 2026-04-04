import { DropdownDirection } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import DropdownPrompt from '@ui/dropdowns/prompt/DropdownPrompt';

/**
 * DropdownPrompt component displays a prompt text in a dropdown
 * with copy functionality.
 */
const meta = {
  argTypes: {
    direction: {
      control: 'select',
      description: 'Dropdown direction',
      options: ['up', 'down'],
    },
    isDisabled: {
      control: 'boolean',
      description: 'Disable the dropdown',
    },
    onCopy: {
      action: 'copied',
      description: 'Callback when prompt is copied',
    },
    promptText: {
      control: 'text',
      description: 'Prompt text to display',
    },
  },
  component: DropdownPrompt,
  parameters: {
    docs: {
      description: {
        component: 'Dropdown component for displaying and copying prompt text.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Dropdowns/DropdownPrompt',
} satisfies Meta<typeof DropdownPrompt>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default prompt dropdown
 */
export const Default: Story = {
  args: {
    direction: DropdownDirection.DOWN,
    isDisabled: false,
    onCopy: (_text: string) => {
      // Prompt copied
    },
    promptText:
      'Create a beautiful landscape photo with mountains and a lake at sunset',
  },
};

/**
 * Long prompt text
 */
export const LongPrompt: Story = {
  args: {
    direction: DropdownDirection.DOWN,
    isDisabled: false,
    onCopy: (_text: string) => {
      // Prompt copied
    },
    promptText:
      'Generate a high-quality video showing a time-lapse of a bustling city street at night with neon lights, people walking, cars driving by, and urban architecture. The video should have a cinematic feel with smooth camera movement and vibrant colors.',
  },
};

/**
 * Short prompt text
 */
export const ShortPrompt: Story = {
  args: {
    direction: DropdownDirection.DOWN,
    isDisabled: false,
    onCopy: (_text: string) => {
      // Prompt copied
    },
    promptText: 'A red apple',
  },
};

/**
 * Disabled state
 */
export const Disabled: Story = {
  args: {
    direction: DropdownDirection.DOWN,
    isDisabled: true,
    onCopy: (_text: string) => {
      // Prompt copied
    },
    promptText: 'This prompt is disabled',
  },
};

/**
 * Dropdown opening upward
 */
export const DirectionUp: Story = {
  args: {
    direction: DropdownDirection.UP,
    isDisabled: false,
    onCopy: (_text: string) => {
      // Prompt copied
    },
    promptText: 'Prompt opening upward',
  },
};

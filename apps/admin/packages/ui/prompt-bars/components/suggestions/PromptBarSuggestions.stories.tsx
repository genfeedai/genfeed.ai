import type { Meta, StoryObj } from '@storybook/react';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import {
  HiOutlineClipboardDocumentCheck,
  HiOutlineSparkles,
} from 'react-icons/hi2';

const meta = {
  component: PromptBarSuggestions,
  title: 'Prompt Bars/Components/PromptBarSuggestions',
} satisfies Meta<typeof PromptBarSuggestions>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onSuggestionSelect: () => {},
    suggestions: [
      {
        icon: <HiOutlineClipboardDocumentCheck className="h-4 w-4" />,
        id: 'create-plan',
        label: 'Create a plan',
        prompt: 'Create a plan for this task',
      },
      {
        icon: <HiOutlineSparkles className="h-4 w-4" />,
        id: 'use-plan-mode',
        label: 'Use plan mode',
        prompt: 'Use plan mode for this request',
      },
      {
        id: 'review',
        label: 'Review changes',
        prompt: 'Review the latest changes on this branch',
      },
    ],
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    isDisabled: true,
  },
};

import { Platform } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarContent from '@ui/prompt-bars/content/PromptBarContent';

const meta: Meta<typeof PromptBarContent> = {
  argTypes: {},
  component: PromptBarContent,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/PromptBars/PromptBarContent',
};

export default meta;
type Story = StoryObj<typeof PromptBarContent>;

/** Enhancement-only surface (articles): no count, platform or thread controls. */
export const Enhancement: Story = {
  args: {
    isEnhancing: false,
    onSubmit: () => Promise.resolve(),
  },
};

/** Generation surface (posts): count, platform and thread controls enabled. */
export const Generation: Story = {
  args: {
    availablePlatforms: [Platform.TWITTER, Platform.INSTAGRAM],
    buttonLabel: 'Generate',
    isEnhancing: false,
    onPlatformChange: () => undefined,
    onSubmit: () => Promise.resolve(),
    platform: Platform.TWITTER,
    showCountDropdown: true,
    showThreadToggle: true,
  },
};

export const Enhancing: Story = {
  args: {
    isEnhancing: true,
    onSubmit: () => Promise.resolve(),
  },
};

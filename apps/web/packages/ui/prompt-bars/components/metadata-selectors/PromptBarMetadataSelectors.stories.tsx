import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarMetadataSelectors from '@ui/prompt-bars/components/metadata-selectors/PromptBarMetadataSelectors';

const meta: Meta<typeof PromptBarMetadataSelectors> = {
  argTypes: {},
  component: PromptBarMetadataSelectors,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/PromptBars/PromptBarMetadataSelectors',
};

export default meta;
type Story = StoryObj<typeof PromptBarMetadataSelectors>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};

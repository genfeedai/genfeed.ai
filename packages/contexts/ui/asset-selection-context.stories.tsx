import AssetSelectionContext from '@genfeedai/contexts/ui/asset-selection-context';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof AssetSelectionContext> = {
  argTypes: {},
  component: AssetSelectionContext,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Contexts/Ui/AssetSelectionContext',
};

export default meta;
type Story = StoryObj<typeof AssetSelectionContext>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};

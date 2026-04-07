import type { Meta, StoryObj } from '@storybook/nextjs';
import TextOverlayPanel from '@ui/ingredients/text-overlay-panel/TextOverlayPanel';

const meta: Meta<typeof TextOverlayPanel> = {
  argTypes: {},
  component: TextOverlayPanel,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/TextOverlayPanel',
};

export default meta;
type Story = StoryObj<typeof TextOverlayPanel>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};

import * as PlatformIconHelper from '@helpers/ui/platform-icon';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof PlatformIconHelper.getPlatformIcon> = {
  argTypes: {},
  component: PlatformIconHelper.getPlatformIcon,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Helpers/Ui/PlatformIcon.helper',
};

export default meta;
type Story = StoryObj<typeof PlatformIconHelper.getPlatformIcon>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};

import type { Meta, StoryObj } from '@storybook/nextjs';
import SocialMediaLink from '@ui/media/social-media-link/SocialMediaLink';

const meta: Meta<typeof SocialMediaLink> = {
  argTypes: {},
  component: SocialMediaLink,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/SocialMediaLink',
};

export default meta;
type Story = StoryObj<typeof SocialMediaLink>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};

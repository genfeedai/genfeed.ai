// @ts-expect-error storybook types not available
import type { Meta, StoryObj } from '@storybook/react';
import MergeProgressBars from '@ui/storyboard/merge-progress-bars/MergeProgressBars';

const meta: Meta<typeof MergeProgressBars> = {
  component: MergeProgressBars,
  tags: ['autodocs'],
  title: 'Components/Storyboard/MergeProgressBars',
};

export default meta;
type Story = StoryObj<typeof MergeProgressBars>;

export const Default: Story = {
  args: {
    steps: [
      {
        id: 'download',
        label: 'Downloading videos',
        status: 'completed',
      },
      {
        id: 'merge',
        label: 'Merging videos',
        progress: 45,
        status: 'active',
      },
      {
        id: 'upload',
        label: 'Uploading result',
        status: 'pending',
      },
    ],
  },
};

export const AllCompleted: Story = {
  args: {
    steps: [
      {
        id: 'download',
        label: 'Downloading videos (3/3)',
        status: 'completed',
      },
      {
        id: 'merge',
        label: 'Merging videos with transitions',
        status: 'completed',
      },
      {
        id: 'upload',
        label: 'Uploading result',
        status: 'completed',
      },
    ],
  },
};

export const WithFailed: Story = {
  args: {
    steps: [
      {
        id: 'download',
        label: 'Downloading videos',
        status: 'completed',
      },
      {
        id: 'merge',
        label: 'Merging videos',
        status: 'failed',
      },
      {
        id: 'upload',
        label: 'Uploading result',
        status: 'pending',
      },
    ],
  },
};

export const WithMusic: Story = {
  args: {
    steps: [
      {
        id: 'download',
        label: 'Downloading videos (2/2)',
        status: 'completed',
      },
      {
        id: 'download-music',
        label: 'Downloading music',
        status: 'completed',
      },
      {
        id: 'merge',
        label: 'Merging videos with music',
        progress: 67,
        status: 'active',
      },
      {
        id: 'upload',
        label: 'Uploading result',
        status: 'pending',
      },
    ],
  },
};

export const WithResize: Story = {
  args: {
    steps: [
      {
        id: 'download',
        label: 'Downloading videos',
        status: 'completed',
      },
      {
        id: 'merge',
        label: 'Merging videos',
        status: 'completed',
      },
      {
        id: 'resize',
        label: 'Resizing video',
        progress: 80,
        status: 'active',
      },
      {
        id: 'upload',
        label: 'Uploading result',
        status: 'pending',
      },
    ],
  },
};

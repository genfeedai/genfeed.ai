import type { IFolder, IOrganization, IUser } from '@genfeedai/interfaces';
import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarFolderSelector from '@ui/prompt-bars/components/folder-selector/PromptBarFolderSelector';
import type { ComponentProps } from 'react';
import { useForm } from 'react-hook-form';

type StoryProps = Omit<ComponentProps<typeof PromptBarFolderSelector>, 'form'>;

function buildFolder(id: string, label: string): IFolder {
  return {
    createdAt: '2024-01-01',
    id,
    isDeleted: false,
    label,
    organization: {} as IOrganization,
    tags: [],
    updatedAt: '2024-01-01',
    user: {} as IUser,
  };
}

function PromptBarFolderSelectorStory(props: StoryProps) {
  const form = useForm<PromptTextareaSchema>({
    defaultValues: { folder: '' },
  });

  return <PromptBarFolderSelector {...props} form={form} />;
}

const meta: Meta<typeof PromptBarFolderSelectorStory> = {
  component: PromptBarFolderSelectorStory,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  title: 'Components/PromptBars/FolderSelector',
};

export default meta;
type Story = StoryObj<typeof PromptBarFolderSelectorStory>;

export const Default: Story = {
  args: {
    controlClass: '',
    folders: [],
    isDisabled: false,
  },
};

export const WithFolders: Story = {
  args: {
    controlClass: '',
    folders: [
      buildFolder('folder-1', 'My Folder'),
      buildFolder('folder-2', 'Another Folder'),
    ],
    isDisabled: false,
  },
};

import '@testing-library/jest-dom';
import type { IFolder, IOrganization, IUser } from '@genfeedai/interfaces';
import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { render } from '@testing-library/react';
import PromptBarFolderSelector from '@ui/prompt-bars/components/folder-selector/PromptBarFolderSelector';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

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

function Wrapper({ folders = [] }: { folders?: IFolder[] }) {
  const form = useForm<PromptTextareaSchema>({
    defaultValues: { folder: '' },
  });

  return (
    <PromptBarFolderSelector
      folders={folders}
      form={form}
      controlClass=""
      isDisabled={false}
    />
  );
}

describe('PromptBarFolderSelector', () => {
  it('renders nothing when no folders are provided', () => {
    const { container } = render(<Wrapper folders={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders when folders are available', () => {
    const folders = [buildFolder('folder-1', 'My Folder')];
    const { container } = render(<Wrapper folders={folders} />);
    expect(container.firstChild).toBeInTheDocument();
  });
});

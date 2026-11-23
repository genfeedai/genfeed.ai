import '@testing-library/jest-dom/vitest';
import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import type {
  IFolder,
  IOrganization,
  IUser,
} from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import PromptBarFolderSelector from '@/components/prompt-bars/components/folder-selector/PromptBarFolderSelector';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

const EMPTY_ARRAY: never[] = [];

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

function Wrapper({ folders = EMPTY_ARRAY }: { folders?: IFolder[] }) {
  const form = useForm<PromptTextareaSchema>({
    defaultValues: { folder: '' },
  });

  return (
    <>
      <PromptBarFolderSelector
        folders={[...folders]}
        form={form}
        controlClass=""
        isDisabled={false}
      />
      <output aria-label="Folder value">
        {form.watch('folder') || 'none'}
      </output>
    </>
  );
}

describe('PromptBarFolderSelector', () => {
  it('renders nothing when no folders are provided', () => {
    render(<Wrapper folders={[]} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('renders when folders are available', () => {
    const folders = [buildFolder('folder-1', 'My Folder')];
    render(<Wrapper folders={folders} />);
    expect(
      screen.getByRole('combobox', { name: 'Folder' }),
    ).toBeInTheDocument();
  });

  it('files the prompt in the chosen folder and clears it again', async () => {
    const user = userEvent.setup();
    render(<Wrapper folders={[buildFolder('folder-1', 'My Folder')]} />);

    await user.click(screen.getByRole('combobox', { name: 'Folder' }));
    await user.click(screen.getByRole('option', { name: 'My Folder' }));
    expect(
      screen.getByRole('status', { name: 'Folder value' }),
    ).toHaveTextContent('folder-1');

    await user.click(screen.getByRole('combobox', { name: 'Folder' }));
    await user.click(screen.getByRole('option', { name: 'No folder' }));
    expect(
      screen.getByRole('status', { name: 'Folder value' }),
    ).toHaveTextContent('none');
  });
});

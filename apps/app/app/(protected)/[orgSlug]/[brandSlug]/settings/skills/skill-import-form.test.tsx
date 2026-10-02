// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import SkillImportForm, {
  type SkillImportFormLabels,
  type SkillImportFormProps,
} from './skill-import-form';

const labels: SkillImportFormLabels = {
  files: 'Package files',
  slug: 'Skill slug',
  sourceUrl: 'Source URL',
  checksum: 'Package checksum',
  submit: 'Import skill',
  submitting: 'Importing',
  selectedFiles: 'Selected files',
  packageHint: 'Choose root SKILL.md and Markdown references, or one ZIP.',
  nestedHint: 'Use ZIP for nested folders.',
  failed: 'Import unavailable. Review the package and retry.',
  errors: {
    SLUG: 'Choose a valid slug.',
    SOURCE_URL: 'Choose a valid source URL.',
    CHECKSUM: 'Choose a valid checksum.',
    COUNT: 'Too many files.',
    PATH: 'Choose Markdown files.',
    DIRECTORY: 'Use ZIP for nested folders.',
    ROOT: 'Choose one root SKILL.md.',
    SIZE: 'Package too large or empty.',
    UTF8: 'Markdown must be UTF8.',
    READ: 'Files could not be read.',
  },
};
function file(name = 'SKILL.md', text = 'root'): File {
  const bytes = new TextEncoder().encode(text);
  const value = new File([bytes], name);
  Object.defineProperty(value, 'arrayBuffer', {
    configurable: true,
    value: async () => bytes.slice().buffer,
  });
  return value;
}
function deferredRead(value: File) {
  let resolve: (bytes: ArrayBuffer) => void = () => undefined;
  Object.defineProperty(value, 'arrayBuffer', {
    configurable: true,
    value: () =>
      new Promise<ArrayBuffer>((done) => {
        resolve = done;
      }),
  });
  return () => resolve(new TextEncoder().encode('root').buffer);
}
type HarnessProps = Pick<SkillImportFormProps, 'onImport'> &
  Partial<
    Pick<
      SkillImportFormProps,
      'isDisabled' | 'isSubmitting' | 'scopeKey' | 'resetKey' | 'error'
    >
  >;
function Harness({
  onImport,
  isDisabled = false,
  isSubmitting = false,
  scopeKey = 'scope-a',
  resetKey = 0,
  error,
}: HarnessProps) {
  const [files, setFiles] = useState<readonly File[]>([]);
  const [slug, setSlug] = useState('Private-Skill');
  const [sourceUrl, setSourceUrl] = useState('');
  const [checksum, setChecksum] = useState('');
  return (
    <SkillImportForm
      files={files}
      slug={slug}
      sourceUrl={sourceUrl}
      checksum={checksum}
      onFilesChange={setFiles}
      onSlugChange={setSlug}
      onSourceUrlChange={setSourceUrl}
      onChecksumChange={setChecksum}
      onImport={onImport}
      labels={labels}
      isDisabled={isDisabled}
      isSubmitting={isSubmitting}
      scopeKey={scopeKey}
      resetKey={resetKey}
      error={error}
    />
  );
}
function select(files: File[]) {
  fireEvent.change(screen.getByLabelText('Package files'), {
    target: { files },
  });
}

describe('SkillImportForm', () => {
  it('selects real files, submits exact input once and never announces creation itself', async () => {
    const onImport = vi.fn(async () => undefined);
    render(<Harness onImport={onImport} />);
    select([file(), file('Voice.md', 'ref')]);
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    await waitFor(() =>
      expect(onImport).toHaveBeenCalledExactlyOnceWith({
        slug: 'private-skill',
        package: {
          format: 'files',
          files: [
            { path: 'SKILL.md', content: 'root' },
            { path: 'Voice.md', content: 'ref' },
          ],
        },
      }),
    );
    expect(screen.getByText('Use ZIP for nested folders.')).toBeVisible();
    expect(
      screen.queryByText(/created|published|enabled|charged/i),
    ).not.toBeInTheDocument();
  });
  it('guards repeated submits synchronously across deferred file reads', async () => {
    const onImport = vi.fn(async () => undefined);
    const value = file();
    const finish = deferredRead(value);
    render(<Harness onImport={onImport} />);
    select([value]);
    const form = screen.getByRole('form', { name: 'Import skill' });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(onImport).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
  });
  it('invalidates stale reads when selected files change', async () => {
    const onImport = vi.fn(async () => undefined);
    const value = file();
    const finish = deferredRead(value);
    render(<Harness onImport={onImport} />);
    select([value]);
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    select([file('SKILL.md', 'new')]);
    await act(async () => finish());
    expect(onImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
  });
  it.each(['disabled', 'scope', 'reset', 'submitting'])(
    'invalidates stale reads after %s changes',
    async (change) => {
      const onImport = vi.fn(async () => undefined);
      const value = file();
      const finish = deferredRead(value);
      const view = render(<Harness onImport={onImport} />);
      select([value]);
      fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
      view.rerender(
        <Harness
          onImport={onImport}
          isDisabled={change === 'disabled'}
          isSubmitting={change === 'submitting'}
          scopeKey={change === 'scope' ? 'scope-b' : 'scope-a'}
          resetKey={change === 'reset' ? 1 : 0}
        />,
      );
      await act(async () => finish());
      expect(onImport).not.toHaveBeenCalled();
    },
  );
  it('never dispatches after unmount', async () => {
    const onImport = vi.fn(async () => undefined);
    const value = file();
    const finish = deferredRead(value);
    const view = render(<Harness onImport={onImport} />);
    select([value]);
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    view.unmount();
    await act(async () => finish());
    expect(onImport).not.toHaveBeenCalled();
  });
  it('suppresses an old callback error after scope changes without claiming success', async () => {
    let reject: (error: Error) => void = () => undefined;
    const onImport = vi.fn(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    );
    const view = render(<Harness onImport={onImport} />);
    select([file()]);
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    view.rerender(<Harness onImport={onImport} scopeKey="scope-b" />);
    await act(async () => reject(new Error('private stale error')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/created|published|enabled/i),
    ).not.toBeInTheDocument();
  });

  it('invalidates delayed reads when controlled slug changes', async () => {
    const onImport = vi.fn(async () => undefined);
    const value = file();
    const finish = deferredRead(value);
    render(<Harness onImport={onImport} />);
    select([value]);
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    fireEvent.change(screen.getByLabelText('Skill slug'), {
      target: { value: 'new-skill' },
    });
    await act(async () => finish());
    expect(onImport).not.toHaveBeenCalled();
  });

  it('shows accessible validation and generic callback errors without leaking exceptions', async () => {
    const onImport = vi.fn(async () => {
      throw new Error('private exception');
    });
    render(<Harness onImport={onImport} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose one root SKILL.md.',
    );
    expect(onImport).not.toHaveBeenCalled();
    select([file()]);
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(labels.failed);
    expect(screen.queryByText('private exception')).not.toBeInTheDocument();
  });
  it('honors authoritative parent disabled/submitting state and recovery text', () => {
    render(
      <Harness
        onImport={vi.fn()}
        isDisabled
        error="Refresh the library before retrying."
      />,
    );
    expect(screen.getByRole('button', { name: 'Import skill' })).toBeDisabled();
    expect(screen.getByLabelText('Package files')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Refresh the library before retrying.',
    );
  });
});

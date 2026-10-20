import type { StudioStoryboardProposal } from '@genfeedai/contracts/api-types/contracts';
import type { CreateStoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { Metadata } from '@genfeedai/models/content/metadata.model';
import { Image } from '@genfeedai/models/ingredients/image.model';
import type { GlobalModalGalleryConfig } from '@genfeedai/props/modals/global-modals.props';
import type { PromptEditorProps } from '@genfeedai/props/prompt-bars/prompt-editor.props';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StoryboardCreate from './StoryboardCreate';

const mocks = vi.hoisted(() => ({
  brandId: 'brand-a',
  create:
    vi.fn<
      (input: Omit<CreateStoryboardRun, 'clientRequestId'>) => Promise<string>
    >(),
  error: null as string | null,
  openGallery: vi.fn<(config: GlobalModalGalleryConfig) => void>(),
  openUpload: vi.fn(),
  push: vi.fn(),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => mocks.brandId,
}));
vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useGalleryModal: () => ({ openGallery: mocks.openGallery }),
    useUploadModal: () => ({ openUpload: mocks.openUpload }),
  }),
);
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org/${mocks.brandId}${path}` }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@pages/studio/storyboard/hooks/use-create-storyboard', () => ({
  useCreateStoryboard: () => ({
    create: mocks.create,
    error: mocks.error,
    isCreating: false,
    isCurrentResult: () => true,
  }),
}));
vi.mock('@pages/studio/storyboard/components/StoryboardAgentBriefs', () => ({
  default: ({
    brandId,
    onSelect,
  }: {
    brandId?: string;
    onSelect: (proposal: StudioStoryboardProposal) => void;
  }) => (
    <button
      type="button"
      data-brand-id={brandId}
      onClick={() =>
        onSelect({
          brief: 'A founder shows the serum going from lab to shelf.',
          shots: [
            { description: 'Lab bench close-up', durationSeconds: 5 },
            { description: 'Bottle on the shelf', durationSeconds: 7 },
          ],
          title: 'Lab to shelf',
          why: 'Origin stories held viewers longest.',
        })
      }
    >
      Agent brief
    </button>
  ),
}));
vi.mock('@genfeedai/agent/components/AgentMediaArtifactPreview', () => ({
  AgentMediaArtifactPreview: () => null,
}));
vi.mock('@ui/prompt-editor/PromptEditor', () => ({
  default: ({
    ariaLabel,
    value,
    isDisabled,
    onValueChange,
    onSubmit,
  }: PromptEditorProps) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      disabled={isDisabled}
      onChange={(event) => onValueChange?.(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSubmit?.();
      }}
    />
  ),
}));
function image(id: string, brandId = mocks.brandId, isDeleted = false) {
  return new Image({
    id,
    brandId,
    isDeleted,
    cdnUrl: `https://assets.test/${id}.jpg`,
    metadata: new Metadata({ label: id }),
  });
}

describe('Storyboard shared composer', () => {
  beforeEach(() => {
    mocks.brandId = 'brand-a';
    mocks.error = null;
    mocks.create.mockReset().mockResolvedValue('saved-storyboard');
    mocks.openGallery.mockReset();
    mocks.openUpload.mockReset();
    mocks.push.mockReset();
  });
  it('prefills the brief, format and runtime from a preset without submitting', () => {
    render(<StoryboardCreate />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Use the How-to tutorial preset' }),
    );
    expect(
      (screen.getByLabelText('Brief') as HTMLTextAreaElement).value,
    ).toContain('how-to tutorial');
    expect(screen.getByLabelText('Runtime budget (seconds)')).toHaveTextContent(
      '40s',
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('fills the brief, shot plan and runtime from an agent brief without submitting', () => {
    render(<StoryboardCreate />);
    const agentBrief = screen.getByRole('button', { name: 'Agent brief' });
    expect(agentBrief).toHaveAttribute('data-brand-id', 'brand-a');
    fireEvent.click(agentBrief);
    expect((screen.getByLabelText('Brief') as HTMLTextAreaElement).value).toBe(
      'A founder shows the serum going from lab to shelf.\n\nShots:\n1. (5s) Lab bench close-up\n2. (7s) Bottle on the shelf',
    );
    expect(screen.getByLabelText('Runtime budget (seconds)')).toHaveTextContent(
      '12s',
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('saves an agent brief sent unchanged as agent-authored', async () => {
    render(<StoryboardCreate />);
    fireEvent.click(screen.getByRole('button', { name: 'Agent brief' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save storyboard' }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          source: expect.objectContaining({ author: 'agent', kind: 'brief' }),
        }),
      ),
    );
  });
  it("saves an edited agent brief as agent_edited, and a preset after it as the member's", async () => {
    render(<StoryboardCreate />);
    fireEvent.click(screen.getByRole('button', { name: 'Agent brief' }));
    const editor = screen.getByLabelText('Brief') as HTMLTextAreaElement;
    fireEvent.change(editor, {
      target: { value: `${editor.value}\n3. (3s) Logo end card` },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save storyboard' }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          source: expect.objectContaining({ author: 'agent_edited' }),
        }),
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Use the How-to tutorial preset' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save storyboard' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1][0].source).not.toHaveProperty('author');
  });
  it('saves the brief with a usable default duration, then navigates to its scoped project', async () => {
    render(<StoryboardCreate />);
    expect(screen.getByTestId('storyboard-composer')).toBeInTheDocument();
    expect(screen.getByLabelText('Runtime budget (seconds)')).toHaveTextContent(
      '30s',
    );
    fireEvent.change(screen.getByLabelText('Brief'), {
      target: { value: 'A founder launches a product.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save storyboard' }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        source: { kind: 'brief', brief: 'A founder launches a product.' },
        planSettings: {
          format: '9:16',
          videoModelKey: null,
          runtimeBudgetSeconds: 30,
          styleReferenceAssetIds: [],
          cast: [],
        },
      }),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        '/org/brand-a/studio/storyboard/saved-storyboard',
      ),
    );
  });
  it('saves only owned, nondeleted style references and clears them when the brand changes', async () => {
    const { rerender } = render(<StoryboardCreate />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Add style references' }),
    );
    expect(mocks.openGallery.mock.calls[0][0].format).toBe('9:16');
    act(() =>
      mocks.openGallery.mock.calls[0][0].onSelect([
        image('style-a'),
        image('foreign', 'brand-b'),
        image('deleted', mocks.brandId, true),
      ]),
    );
    fireEvent.change(screen.getByLabelText('Brief'), {
      target: { value: 'My story' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save storyboard' }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          planSettings: expect.objectContaining({
            styleReferenceAssetIds: ['style-a'],
          }),
        }),
      ),
    );
    mocks.brandId = 'brand-b';
    rerender(<StoryboardCreate />);
    expect(screen.queryByText('style-a')).not.toBeInTheDocument();
    mocks.create.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Save storyboard' }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          planSettings: expect.objectContaining({ styleReferenceAssetIds: [] }),
        }),
      ),
    );
  });
  it('retains the brief and selected image after a failed save for explicit retry', async () => {
    const { rerender } = render(<StoryboardCreate />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Choose a starting image',
      }),
    );
    act(() =>
      mocks.openGallery.mock.calls[0][0].onSelect([image('starting-image')]),
    );
    fireEvent.change(screen.getByLabelText('Brief'), {
      target: { value: 'Keep this story' },
    });
    mocks.create.mockRejectedValueOnce(new Error('Offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Save storyboard' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    mocks.error = 'Offline';
    rerender(<StoryboardCreate />);
    expect(screen.getByLabelText('Brief')).toHaveValue('Keep this story');
    expect(screen.getByText('starting-image')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Offline');
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Retry saving storyboard',
      }),
    );
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
  });
  it('does not dispatch invalid or overlong prompts through keyboard submit', () => {
    render(<StoryboardCreate />);
    fireEvent.keyDown(screen.getByLabelText('Brief'), { key: 'Enter' });
    fireEvent.change(screen.getByLabelText('Brief'), {
      target: { value: 'x'.repeat(2001) },
    });
    fireEvent.keyDown(screen.getByLabelText('Brief'), { key: 'Enter' });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Save storyboard' }),
    ).toBeDisabled();
  });
});

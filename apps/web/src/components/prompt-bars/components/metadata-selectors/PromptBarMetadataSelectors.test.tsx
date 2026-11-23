import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { ModelCategory } from '@genfeedai/contracts';
import type { IPreset } from '@genfeedai/contracts/interfaces';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import PromptBarMetadataSelectors from '@/components/prompt-bars/components/metadata-selectors/PromptBarMetadataSelectors';
import type { PromptBarMetadataSelectorsProps } from '@/props/prompt-bars/prompt-bar-metadata-selectors.props';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

describe('PromptBarMetadataSelectors', () => {
  const mockForm: UseFormReturn<PromptTextareaSchema> = {
    getValues: vi.fn().mockReturnValue(''),
    setValue: vi.fn(),
  } as unknown as UseFormReturn<PromptTextareaSchema>;

  const preset: IPreset = {
    category: ModelCategory.IMAGE,
    createdAt: '2024-01-01',
    description: 'Preset description',
    id: 'preset-1',
    isActive: true,
    isDeleted: false,
    key: 'preset-1',
    label: 'Preset 1',
    updatedAt: '2024-01-01',
  };

  const baseProps: PromptBarMetadataSelectorsProps = {
    controlClass: 'control-class',
    currentConfig: { buttons: { presets: true } },
    filteredCameraMovements: [],
    filteredCameras: [],
    filteredFontFamilies: [],
    filteredLenses: [],
    filteredLightings: [],
    filteredMoods: [],
    filteredPresets: [preset],
    filteredScenes: [],
    filteredStyles: [],
    form: mockForm,
    isDisabledState: false,
    profiles: [],
    refocusTextarea: vi.fn(),
    selectedPreset: '',
    selectedProfile: '',
    setSelectedPreset: vi.fn(),
    setSelectedProfile: vi.fn(),
  };

  it('shows no picker for a list that is not there', () => {
    render(
      <PromptBarMetadataSelectors
        {...baseProps}
        currentConfig={{ buttons: {} }}
        filteredPresets={[]}
      />,
    );

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('puts a chosen preset prompt into the form', async () => {
    const setSelectedPreset = vi.fn();
    render(
      <PromptBarMetadataSelectors
        {...baseProps}
        setSelectedPreset={setSelectedPreset}
      />,
    );

    await userEvent
      .setup()
      .click(screen.getByRole('combobox', { name: 'Preset' }));
    await userEvent
      .setup()
      .click(screen.getByRole('option', { name: 'Preset 1' }));

    expect(setSelectedPreset).toHaveBeenCalledWith('preset-1');
    expect(mockForm.setValue).toHaveBeenCalledWith(
      'text',
      'Preset description',
      { shouldValidate: true },
    );
  });

  it('lists presets under their group heading', async () => {
    render(<PromptBarMetadataSelectors {...baseProps} />);

    await userEvent
      .setup()
      .click(screen.getByRole('combobox', { name: 'Preset' }));

    expect(screen.getByRole('group', { name: 'Assets' })).toContainElement(
      screen.getByRole('option', { name: 'Preset 1' }),
    );
  });

  it('clears an element choice with the none row', async () => {
    const form = {
      getValues: vi.fn().mockReturnValue(''),
      setValue: vi.fn(),
      watch: vi.fn().mockReturnValue('cinematic'),
    } as unknown as UseFormReturn<PromptTextareaSchema>;
    const refocusTextarea = vi.fn();
    render(
      <PromptBarMetadataSelectors
        {...baseProps}
        currentConfig={{ buttons: { style: true } }}
        filteredPresets={[]}
        filteredStyles={[
          {
            description: 'Film look',
            key: 'cinematic',
            label: 'Cinematic',
          } as never,
        ]}
        form={form}
        refocusTextarea={refocusTextarea}
      />,
    );

    const user = userEvent.setup();
    expect(screen.getByRole('combobox', { name: 'Style' })).toHaveTextContent(
      'Cinematic',
    );
    await user.click(screen.getByRole('combobox', { name: 'Style' }));
    await user.click(screen.getByRole('option', { name: 'None' }));

    expect(form.setValue).toHaveBeenCalledWith('style', '', {
      shouldValidate: true,
    });
  });

  it('sets the brand voice', async () => {
    const setSelectedProfile = vi.fn();
    render(
      <PromptBarMetadataSelectors
        {...baseProps}
        currentConfig={{ buttons: {} }}
        filteredPresets={[]}
        profiles={[{ id: 'voice-1', name: 'Playful' }]}
        setSelectedProfile={setSelectedProfile}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Brand Voice' }));
    await user.click(screen.getByRole('option', { name: 'Playful' }));

    expect(setSelectedProfile).toHaveBeenCalledWith('voice-1');
  });
});

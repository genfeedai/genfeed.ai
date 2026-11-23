import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { ModelCategory } from '@genfeedai/contracts';
import type { IPreset } from '@genfeedai/contracts/interfaces';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import PromptBarMetadataSelectors from '@/components/prompt-bars/components/metadata-selectors/PromptBarMetadataSelectors';
import type { PromptBarMetadataSelectorsProps } from '@/props/prompt-bars/prompt-bar-metadata-selectors.props';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

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

const emptyLists = {
  filteredCameraMovements: [],
  filteredCameras: [],
  filteredFontFamilies: [],
  filteredLenses: [],
  filteredLightings: [],
  filteredMoods: [],
  filteredPresets: [],
  filteredScenes: [],
  filteredStyles: [],
  profiles: [],
};

function Harness(overrides: Partial<PromptBarMetadataSelectorsProps>) {
  const form = useForm<PromptTextareaSchema>({
    defaultValues: { style: 'cinematic', text: '' },
  });
  const [selectedPreset, setSelectedPreset] = useState('');
  const [selectedProfile, setSelectedProfile] = useState('');

  return (
    <>
      <PromptBarMetadataSelectors
        controlClass=""
        currentConfig={{ buttons: { presets: true, style: true } }}
        {...emptyLists}
        form={form}
        isDisabledState={false}
        refocusTextarea={() => {}}
        selectedPreset={selectedPreset}
        selectedProfile={selectedProfile}
        setSelectedPreset={setSelectedPreset}
        setSelectedProfile={setSelectedProfile}
        {...overrides}
      />
      <output aria-label="Prompt text">{form.watch('text')}</output>
      <output aria-label="Brand voice">{selectedProfile}</output>
    </>
  );
}

describe('PromptBarMetadataSelectors', () => {
  it('shows no picker for a list that is not there', () => {
    render(<Harness />);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('puts the chosen preset prompt into the prompt text', async () => {
    const user = userEvent.setup();
    render(<Harness filteredPresets={[preset]} />);

    await user.click(screen.getByRole('combobox', { name: 'Preset' }));
    await user.click(screen.getByRole('option', { name: 'Preset 1' }));

    expect(
      screen.getByRole('status', { name: 'Prompt text' }),
    ).toHaveTextContent('Preset description');
    expect(screen.getByRole('combobox', { name: 'Preset' })).toHaveTextContent(
      'Preset 1',
    );
  });

  it('lists presets under their group heading', async () => {
    render(<Harness filteredPresets={[preset]} />);

    await userEvent
      .setup()
      .click(screen.getByRole('combobox', { name: 'Preset' }));

    expect(screen.getByRole('group', { name: 'Assets' })).toContainElement(
      screen.getByRole('option', { name: 'Preset 1' }),
    );
  });

  it('clears an element choice with the none row', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        filteredStyles={
          [
            { description: 'Film look', key: 'cinematic', label: 'Cinematic' },
          ] as never
        }
      />,
    );

    const style = screen.getByRole('combobox', { name: 'Style' });
    expect(style).toHaveTextContent('Cinematic');

    await user.click(style);
    await user.click(screen.getByRole('option', { name: 'None' }));

    expect(screen.getByRole('combobox', { name: 'Style' })).toHaveTextContent(
      'None',
    );
  });

  it('sets the brand voice', async () => {
    const user = userEvent.setup();
    render(<Harness profiles={[{ id: 'voice-1', name: 'Playful' }]} />);

    await user.click(screen.getByRole('combobox', { name: 'Brand Voice' }));
    await user.click(screen.getByRole('option', { name: 'Playful' }));

    expect(
      screen.getByRole('status', { name: 'Brand voice' }),
    ).toHaveTextContent('voice-1');
  });
});

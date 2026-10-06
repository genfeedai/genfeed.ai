'use client';

import { useGenerationHarnessSettings } from '@hooks/data/generation/use-generation-harness-settings';
import GenerationHarnessSettingsCard from '@ui/dropdowns/generation-setup/GenerationHarnessSettingsCard';

export default function GenerationHarnessSettingsSection() {
  const { save, refresh, ...state } = useGenerationHarnessSettings(true);
  return (
    <GenerationHarnessSettingsCard
      {...state}
      className="p-0"
      showTitle={false}
      onSave={save}
      onRefresh={refresh}
    />
  );
}

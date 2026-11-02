'use client';

import OrganizationModulePreferenceGate from '@/components/guards/organization-module/OrganizationModulePreferenceGate';
import EditorNewPane from './EditorNewPane';

/** Starting an Editor project needs the Editor module enabled for the organization. */
export default function EditorCreatePane() {
  return (
    <OrganizationModulePreferenceGate moduleId="editor">
      <EditorNewPane />
    </OrganizationModulePreferenceGate>
  );
}

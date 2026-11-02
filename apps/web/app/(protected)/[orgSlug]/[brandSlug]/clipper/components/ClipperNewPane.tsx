'use client';

import OrganizationModulePreferenceGate from '@/components/guards/organization-module/OrganizationModulePreferenceGate';
import ClipperNewPaneContent from './ClipperNewPaneContent';

/** Importing a source needs the Clipper module enabled for the organization. */
export default function ClipperNewPane() {
  return (
    <OrganizationModulePreferenceGate moduleId="clipper">
      <ClipperNewPaneContent />
    </OrganizationModulePreferenceGate>
  );
}

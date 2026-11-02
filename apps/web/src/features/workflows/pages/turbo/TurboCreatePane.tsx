'use client';

import OrganizationModulePreferenceGate from '@/components/guards/organization-module/OrganizationModulePreferenceGate';
import TurboNewPane from './TurboNewPane';

/** Creating a Turbo project needs the Turbo module enabled for the organization. */
export default function TurboCreatePane() {
  return (
    <OrganizationModulePreferenceGate moduleId="turbo">
      <TurboNewPane />
    </OrganizationModulePreferenceGate>
  );
}

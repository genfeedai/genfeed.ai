import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import AutomateSkillsPage from '../automate-skills-page';

export const generateMetadata = createPageMetadata('Agent Skills');

export default function AutomateSkillsRoute() {
  return (
    <ErrorBoundary>
      <AutomateSkillsPage />
    </ErrorBoundary>
  );
}

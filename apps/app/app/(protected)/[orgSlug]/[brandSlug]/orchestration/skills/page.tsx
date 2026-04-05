import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import OrchestrationSkillsPage from '../orchestration-skills-page';

export const generateMetadata = createPageMetadata('Agent Skills');

export default function OrchestrationSkillsRoute() {
  return (
    <ErrorBoundary>
      <OrchestrationSkillsPage />
    </ErrorBoundary>
  );
}

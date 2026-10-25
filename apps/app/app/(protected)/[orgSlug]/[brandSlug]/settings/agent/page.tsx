import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AgentDefaults from './agent-defaults';

export const generateMetadata = createPageMetadata('Agent settings');

export default function BrandAgentSettingsRoute() {
  return <AgentDefaults />;
}

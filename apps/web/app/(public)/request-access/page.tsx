import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Request Access');

export default function AppRequestAccessPage() {
  return <PlaceholderPage />;
}

function PlaceholderPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Coming soon</h1>
    </div>
  );
}

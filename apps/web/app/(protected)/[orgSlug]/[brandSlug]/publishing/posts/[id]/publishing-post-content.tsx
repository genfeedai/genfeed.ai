import type { DetailPageProps } from '@/props/pages/page.props';
import PublishingContentEditorPage from './PublishingContentEditorPage';

export default async function PublishingPostContent({
  params,
}: DetailPageProps) {
  const { id } = await params;

  return <PublishingContentEditorPage contentId={id} />;
}

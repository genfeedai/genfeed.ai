import { AgentPageContent } from '@pages/agent';

interface AdminAgentThreadPageProps {
  params: Promise<{
    threadId: string;
  }>;
}

export default async function AdminAgentThreadPage({
  params,
}: AdminAgentThreadPageProps) {
  const { threadId } = await params;

  return (
    <AgentPageContent threadId={threadId === 'new' ? undefined : threadId} />
  );
}

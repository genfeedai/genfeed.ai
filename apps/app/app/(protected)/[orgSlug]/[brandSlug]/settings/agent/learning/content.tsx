'use client';

import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import AgentLearningTab from '../agent-learning-tab';

export default function AgentLearningContent() {
  const { brandId } = useBrandDetail();
  return <AgentLearningTab brandId={brandId} />;
}

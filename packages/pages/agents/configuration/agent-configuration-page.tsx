'use client';

import { useAuth } from '@clerk/nextjs';
import { type AgentApiConfig, AgentSettings } from '@cloud/agent';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import Container from '@ui/layout/container/Container';
import { useMemo } from 'react';
import { HiOutlineCog6Tooth } from 'react-icons/hi2';

export default function AgentConfigurationPage() {
  const { getToken } = useAuth();
  const { brandId } = useBrand();

  const apiConfig = useMemo<AgentApiConfig>(
    () => ({
      baseUrl: process.env.NEXT_PUBLIC_API_ENDPOINT ?? '',
      getToken: async () => resolveClerkToken(getToken),
    }),
    [getToken],
  );

  return (
    <Container label="Agent Configuration" icon={<HiOutlineCog6Tooth />}>
      <AgentSettings apiConfig={apiConfig} brandId={brandId} />
    </Container>
  );
}

'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { type AgentApiConfig, AgentSettings } from '@genfeedai/agent';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import Container from '@ui/layout/container/Container';
import { useMemo } from 'react';
import { HiOutlineCog6Tooth } from 'react-icons/hi2';

export default function AgentConfigurationPage() {
  const { getToken } = useAuthIdentity();
  const { brandId } = useBrand();

  const apiConfig = useMemo<AgentApiConfig>(
    () => ({
      baseUrl: process.env.NEXT_PUBLIC_API_ENDPOINT ?? '',
      getToken: async () => resolveAuthToken(getToken),
    }),
    [getToken],
  );

  return (
    <Container label="Agent Configuration" icon={<HiOutlineCog6Tooth />}>
      <AgentSettings apiConfig={apiConfig} brandId={brandId} />
    </Container>
  );
}

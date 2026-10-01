'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { GenerationReviewsContext } from '@contexts/content/generation-reviews-context';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { LayoutProps } from '@props/layout/layout.props';
import Container from '@ui/layout/container/Container';
import { Image } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

export default function GenerationsLayout({ children }: LayoutProps) {
  const t = useTranslations('pages.adminGenerations');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const handleRefresh = useCallback((): void => {
    setIsRefreshing(true);
    setRefreshVersion((version) => version + 1);
  }, []);
  const contextValue = useMemo(
    () => ({ refreshVersion, setIsRefreshing }),
    [refreshVersion],
  );

  return (
    <GenerationReviewsContext.Provider value={contextValue}>
      <Container
        label={t('layoutTitle')}
        description={t('description')}
        icon={Image}
        headerTabs={{
          fullWidth: false,
          tabs: [
            {
              href: APP_ROUTES.ADMIN.CONTENT.GENERATIONS,
              label: t('layoutTitle'),
            },
            {
              href: APP_ROUTES.ADMIN.CONTENT.PROMPTS_LIST,
              label: t('promptsTab'),
            },
          ],
        }}
        right={
          <ButtonRefresh onClick={handleRefresh} isRefreshing={isRefreshing} />
        }
      >
        {children}
      </Container>
    </GenerationReviewsContext.Provider>
  );
}

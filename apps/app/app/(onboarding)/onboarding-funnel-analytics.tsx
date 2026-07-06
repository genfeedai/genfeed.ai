'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import {
  ANALYTICS_EVENTS,
  type CheckoutKind,
  captureAnalyticsEvent,
} from '@/lib/analytics';

const CHECKOUT_COMPLETED_PARAM = 'checkout';
const CHECKOUT_COMPLETED_VALUE = 'completed';
const CHECKOUT_KIND_PARAM = 'checkoutKind';
const CHECKOUT_DEDUPE_PREFIX = 'genfeed.analytics.checkout_completed';

function parseCheckoutKind(value: string | null): CheckoutKind | null {
  if (value === 'credits' || value === 'managed_credits' || value === 'plan') {
    return value;
  }

  return null;
}

function shouldCaptureOnce(key: string): boolean {
  try {
    if (sessionStorage.getItem(key)) {
      return false;
    }

    sessionStorage.setItem(key, '1');
    return true;
  } catch {
    return true;
  }
}

export default function OnboardingFunnelAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (
      searchParams.get(CHECKOUT_COMPLETED_PARAM) !== CHECKOUT_COMPLETED_VALUE
    ) {
      return;
    }

    const checkoutKind = parseCheckoutKind(
      searchParams.get(CHECKOUT_KIND_PARAM),
    );
    if (!checkoutKind) {
      return;
    }

    const dedupeKey = `${CHECKOUT_DEDUPE_PREFIX}:${pathname}:${checkoutKind}`;
    if (!shouldCaptureOnce(dedupeKey)) {
      return;
    }

    captureAnalyticsEvent(ANALYTICS_EVENTS.CHECKOUT_COMPLETED, {
      checkoutKind,
      handoffSource: 'stripe_return',
    });

    if (checkoutKind === 'credits' || checkoutKind === 'managed_credits') {
      captureAnalyticsEvent(ANALYTICS_EVENTS.FIRST_CREDIT_PURCHASED, {
        checkoutKind,
        handoffSource: 'stripe_return',
      });
    }
  }, [pathname, searchParams]);

  return null;
}

'use client';

import type {
  ICrmCompany,
  ICrmLead,
  IProactivePreparationStatus,
} from '@genfeedai/interfaces';
import Button from '@components/buttons/base/Button';
import { ButtonVariant, ProactiveOnboardingStatus } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminCrmService } from '@services/admin/crm.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import AppLink from '@ui/navigation/link/Link';
import { Input } from '@ui/primitives/input';
import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 5000;

interface ProactiveOnboardingCardProps {
  lead: ICrmLead;
  onRefresh: () => void;
}

function getDefaultBrandUrl(lead: ICrmLead): string {
  if (lead.brandUrl) {
    return lead.brandUrl;
  }
  if (typeof lead.company === 'object' && lead.company) {
    const company = lead.company as ICrmCompany;
    return company.website ?? company.domain ?? '';
  }
  return '';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function ProactiveOnboardingCard({
  lead,
  onRefresh,
}: ProactiveOnboardingCardProps) {
  const status =
    (lead.proactiveStatus as ProactiveOnboardingStatus) ??
    ProactiveOnboardingStatus.NONE;
  const [brandUrl, setBrandUrl] = useState(getDefaultBrandUrl(lead));
  const [brandName, setBrandName] = useState('');
  const [industry, setIndustry] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [contentCount, setContentCount] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prepStatus, setPrepStatus] =
    useState<IProactivePreparationStatus | null>(null);
  const effectiveStatus =
    (prepStatus?.proactiveStatus as ProactiveOnboardingStatus) || status;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getCrmService = useAuthedService((token: string) =>
    AdminCrmService.getInstance(token),
  );

  const pollStatus = useCallback(async () => {
    try {
      const service = await getCrmService();
      const result = await service.getPreparationStatus(lead.id);
      setPrepStatus(result);

      const newStatus = result.proactiveStatus as ProactiveOnboardingStatus;
      if (
        newStatus !== ProactiveOnboardingStatus.BRAND_PREPARING &&
        newStatus !== ProactiveOnboardingStatus.CONTENT_GENERATING
      ) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        onRefresh();
      }
    } catch (error) {
      logger.error('Poll preparation status failed', error);
    }
  }, [getCrmService, lead.id, onRefresh]);

  useEffect(() => {
    const isPollingStatus =
      status === ProactiveOnboardingStatus.BRAND_PREPARING ||
      status === ProactiveOnboardingStatus.CONTENT_GENERATING;

    if (isPollingStatus) {
      pollStatus();
      pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [status, pollStatus]);

  useEffect(() => {
    if (
      effectiveStatus !== ProactiveOnboardingStatus.NONE &&
      effectiveStatus !== ProactiveOnboardingStatus.BRAND_PREPARING &&
      effectiveStatus !== ProactiveOnboardingStatus.CONTENT_GENERATING
    ) {
      getCrmService()
        .then((service) => service.getPreparationStatus(lead.id))
        .then(setPrepStatus)
        .catch((error) =>
          logger.error('Fetch preparation status failed', error),
        );
    }
  }, [effectiveStatus, getCrmService, lead.id]);

  const handlePrepareBrand = useCallback(async () => {
    if (!brandUrl.trim()) {
      NotificationsService.getInstance().error('Brand URL is required');
      return;
    }
    setIsSubmitting(true);
    try {
      const service = await getCrmService();
      await service.prepareBrand(lead.id, {
        brandName: brandName.trim() || undefined,
        brandUrl: brandUrl.trim(),
        industry: industry.trim() || undefined,
        targetAudience: targetAudience.trim() || undefined,
      });
      NotificationsService.getInstance().success('Brand preparation started');
      onRefresh();
    } catch (error) {
      logger.error('Prepare brand failed', error);
      NotificationsService.getInstance().error('Prepare brand');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    brandUrl,
    brandName,
    industry,
    targetAudience,
    getCrmService,
    lead.id,
    onRefresh,
  ]);

  const handleGenerateContent = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const service = await getCrmService();
      await service.generateContent(lead.id, { count: contentCount });
      NotificationsService.getInstance().success('Content generation started');
      onRefresh();
    } catch (error) {
      logger.error('Generate content failed', error);
      NotificationsService.getInstance().error('Generate content');
    } finally {
      setIsSubmitting(false);
    }
  }, [getCrmService, lead.id, contentCount, onRefresh]);

  const handleSendInvitation = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const service = await getCrmService();
      await service.sendInvitation(lead.id);
      NotificationsService.getInstance().success('Invitation sent');
      onRefresh();
    } catch (error) {
      logger.error('Send invitation failed', error);
      NotificationsService.getInstance().error('Send invitation');
    } finally {
      setIsSubmitting(false);
    }
  }, [getCrmService, lead.id, onRefresh]);

  return (
    <Card label="Proactive Onboarding">
      {effectiveStatus === ProactiveOnboardingStatus.NONE && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-foreground/40 block mb-1">
              Brand URL
            </label>
            <Input
              className="w-full bg-white/5 border border-white/[0.08] rounded px-3 py-2 text-sm"
              placeholder="https://example.com"
              value={brandUrl}
              onChange={(e) => setBrandUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-foreground/40 block mb-1">
              Brand Name (optional)
            </label>
            <Input
              className="w-full bg-white/5 border border-white/[0.08] rounded px-3 py-2 text-sm"
              placeholder="Acme Inc"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-foreground/40 block mb-1">
                Industry (optional)
              </label>
              <Input
                className="w-full bg-white/5 border border-white/[0.08] rounded px-3 py-2 text-sm"
                placeholder="SaaS, E-commerce..."
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-foreground/40 block mb-1">
                Target Audience (optional)
              </label>
              <Input
                className="w-full bg-white/5 border border-white/[0.08] rounded px-3 py-2 text-sm"
                placeholder="B2B marketers..."
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
              />
            </div>
          </div>
          <Button
            label={isSubmitting ? 'Preparing...' : 'Prepare Brand'}
            variant={ButtonVariant.DEFAULT}
            onClick={handlePrepareBrand}
            isDisabled={isSubmitting}
          />
        </div>
      )}

      {effectiveStatus === ProactiveOnboardingStatus.BRAND_PREPARING && (
        <div className="flex items-center gap-3 py-4">
          <div className="w-5 h-5 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
          <span className="text-sm text-foreground/60">Analyzing brand...</span>
        </div>
      )}

      {effectiveStatus === ProactiveOnboardingStatus.BRAND_READY && (
        <div className="space-y-3">
          {prepStatus?.brand && (
            <div className="space-y-2">
              <div className="text-sm">
                <span className="text-foreground/40">Brand:</span>{' '}
                <span className="font-medium">{prepStatus.brand.name}</span>
              </div>
              {prepStatus.brand.colors &&
                prepStatus.brand.colors.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-foreground/40">Colors:</span>
                    {prepStatus.brand.colors.map((color) => (
                      <div
                        key={color}
                        className="w-5 h-5 rounded-full border border-white/[0.08]"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                )}
              {prepStatus.brand.voiceTone && (
                <div className="text-sm">
                  <span className="text-foreground/40">Tone:</span>{' '}
                  <span className="text-foreground/60">
                    {prepStatus.brand.voiceTone}
                  </span>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 pt-2 border-t border-white/[0.08]">
            <div>
              <label className="text-xs text-foreground/40 block mb-1">
                Posts to generate
              </label>
              <Input
                type="number"
                className="w-20 bg-white/5 border border-white/[0.08] rounded px-3 py-1.5 text-sm"
                value={contentCount}
                min={1}
                max={50}
                onChange={(e) => setContentCount(Number(e.target.value))}
              />
            </div>
            <Button
              label={isSubmitting ? 'Starting...' : 'Generate Content'}
              variant={ButtonVariant.DEFAULT}
              onClick={handleGenerateContent}
              isDisabled={isSubmitting}
              className="mt-4"
            />
          </div>
        </div>
      )}

      {effectiveStatus === ProactiveOnboardingStatus.CONTENT_GENERATING && (
        <div className="flex items-center gap-3 py-4">
          <div className="w-5 h-5 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
          <div>
            <span className="text-sm text-foreground/60">
              Generating content...
            </span>
            {prepStatus?.batch && (
              <span className="text-xs text-foreground/40 ml-2">
                {prepStatus.batch.completedPosts}/{prepStatus.batch.totalPosts}{' '}
                posts
              </span>
            )}
          </div>
        </div>
      )}

      {effectiveStatus === ProactiveOnboardingStatus.READY && (
        <div className="space-y-3">
          {prepStatus?.batch && (
            <div className="space-y-2">
              <div className="text-sm">
                <span className="text-foreground/40">Posts ready:</span>{' '}
                <span className="font-medium">
                  {prepStatus.batch.completedPosts}
                </span>
              </div>
              {prepStatus.batch.platforms.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-foreground/40">Platforms:</span>
                  {prepStatus.batch.platforms.map((platform) => (
                    <Badge key={platform} variant="ghost">
                      {platform}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-2 border-t border-white/[0.08]">
            <AppLink
              url={`/crm/leads/${lead.id}/review-content`}
              label="Review Content"
              variant={ButtonVariant.SECONDARY}
            />
            {lead.email && (
              <Button
                label={isSubmitting ? 'Sending...' : 'Send Invitation'}
                variant={ButtonVariant.DEFAULT}
                onClick={handleSendInvitation}
                isDisabled={isSubmitting}
              />
            )}
          </div>
        </div>
      )}

      {effectiveStatus === ProactiveOnboardingStatus.INVITED && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="info">Invited</Badge>
            {(lead.invitedAt ?? prepStatus?.invitation?.invitedAt) && (
              <span className="text-xs text-foreground/40">
                on{' '}
                {formatDate(
                  (lead.invitedAt ??
                    prepStatus?.invitation?.invitedAt) as string,
                )}
              </span>
            )}
          </div>
          <Button
            label={isSubmitting ? 'Resending...' : 'Resend Invitation'}
            variant={ButtonVariant.DEFAULT}
            onClick={handleSendInvitation}
            isDisabled={isSubmitting}
          />
        </div>
      )}

      {effectiveStatus === ProactiveOnboardingStatus.STARTED && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="info">Started</Badge>
            {prepStatus?.claimedAt && (
              <span className="text-xs text-foreground/40">
                claimed on {formatDate(prepStatus.claimedAt)}
              </span>
            )}
          </div>
          <div className="text-sm text-foreground/60">
            The lead has claimed the prepared workspace and is moving through
            payment or self-serve onboarding.
          </div>
          <AppLink
            url={`/crm/leads/${lead.id}/review-content`}
            label="Review Prepared Content"
            variant={ButtonVariant.SECONDARY}
          />
        </div>
      )}

      {(effectiveStatus === ProactiveOnboardingStatus.PAYMENT_MADE ||
        effectiveStatus === ProactiveOnboardingStatus.CONVERTED) && (
        <div className="flex items-center gap-2">
          <Badge variant="success">
            {effectiveStatus === ProactiveOnboardingStatus.PAYMENT_MADE
              ? 'Payment Made'
              : 'Converted'}
          </Badge>
          {(lead.paymentMadeAt ??
            prepStatus?.paymentMadeAt ??
            lead.convertedAt) && (
            <span className="text-xs text-foreground/40">
              on{' '}
              {formatDate(
                (lead.paymentMadeAt ??
                  prepStatus?.paymentMadeAt ??
                  lead.convertedAt) as string,
              )}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

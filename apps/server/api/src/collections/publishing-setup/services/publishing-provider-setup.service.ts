import {
  PUBLISHING_PROVIDER_ENV_DESCRIPTORS,
  type PublishingProviderEnvDescriptor,
} from '@api/collections/publishing-setup/publishing-setup.constants';
import {
  resolveOAuthAppUrl,
  resolveOAuthIssuerUrl,
} from '@api/oauth/oauth-metadata.util';
import { isCloudDeployment, isUnconfiguredSecret } from '@genfeedai/config';
import type {
  IPublishingProviderSetupSignals,
  IPublishingSetupCheck,
  PublishingSetupCheckStatus,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { Injectable } from '@nestjs/common';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Config-derived publishing setup signals for a single provider.
 *
 * Split out of `PublishingSetupService` so per-credential readiness can reuse
 * the same provider/callback evaluation without dragging in the database and
 * queue probes — `CredentialsCoreModule` must not depend on the checklist's
 * runtime prober.
 *
 * Everything here reads configuration *presence* and URL *shape* only. No value
 * is ever echoed back and no provider network call is made.
 */
@Injectable()
export class PublishingProviderSetupService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Config-derived signals for one provider, in the shape the credential
   * readiness builder consumes. An unrecognised provider key yields `unknown`
   * across the board rather than a false `pass`.
   */
  resolveProviderSignals(
    providerKey: string,
    checkedAt: string,
  ): IPublishingProviderSetupSignals {
    const descriptor = PUBLISHING_PROVIDER_ENV_DESCRIPTORS.find(
      (candidate) => String(candidate.platform) === providerKey,
    );

    if (!descriptor) {
      return {
        appReviewStatus: 'unknown',
        callbackUrlStatus: 'unknown',
        diagnostics: [],
      };
    }

    const providerCheck = this.buildProviderCheck(descriptor, checkedAt);
    const publicCallbackCheck = this.buildPublicCallbackCheck(checkedAt);
    // App review asks about a *complete* app, so it takes the strict predicate:
    // a client id with no secret is nothing a provider console would accept for
    // submission. `buildProviderCheck` deliberately uses the loose one instead —
    // see the two predicates at the bottom of this file.
    const isConfigured = this.hasCompleteProviderAppCredentials(descriptor);

    return {
      appReviewStatus: this.resolveAppReviewStatus(descriptor, isConfigured),
      callbackUrlStatus: this.worstStatus(
        providerCheck.status,
        publicCallbackCheck.status,
      ),
      diagnostics: [
        ...providerCheck.diagnostics,
        ...publicCallbackCheck.diagnostics,
        ...this.buildAppReviewDiagnostics(descriptor, isConfigured, checkedAt),
      ],
    };
  }

  buildPublicCallbackCheck(checkedAt: string): IPublishingSetupCheck {
    const check: IPublishingSetupCheck = {
      diagnostics: [],
      key: 'callback.public_urls',
      label: 'Public callback URLs',
      scope: 'callback',
      status: 'pass',
    };

    const origins: Array<{ envKey: string; url: string }> = [
      {
        envKey: 'GENFEEDAI_API_PUBLIC_URL',
        url: resolveOAuthIssuerUrl(this.configService),
      },
      {
        envKey: 'GENFEEDAI_APP_URL',
        url: resolveOAuthAppUrl(this.configService),
      },
    ];

    const isCloud = isCloudDeployment();

    for (const origin of origins) {
      const parsed = this.parseAbsoluteUrl(origin.url);

      if (!parsed) {
        check.status = 'fail';
        check.diagnostics.push({
          checkedAt,
          classification: 'misconfiguration',
          code: 'callback_origin_invalid',
          correctiveAction: `Set ${origin.envKey} to an absolute origin, e.g. https://app.example.com.`,
          details: { envKey: origin.envKey },
          isRetryable: false,
          message: `${origin.envKey} is not an absolute URL, so OAuth callbacks cannot be built.`,
          scope: 'callback',
          severity: 'error',
        });
        continue;
      }

      if (!this.isLoopbackHost(parsed.hostname)) {
        continue;
      }

      check.status = this.worstStatus(check.status, isCloud ? 'fail' : 'warn');
      check.diagnostics.push({
        checkedAt,
        classification: 'misconfiguration',
        code: 'callback_origin_not_publicly_reachable',
        correctiveAction: `Point ${origin.envKey} at the externally reachable origin registered with each provider.`,
        details: { envKey: origin.envKey },
        isRetryable: false,
        message: `${origin.envKey} resolves to a loopback host, which providers requiring a public callback will reject.`,
        scope: 'callback',
        severity: isCloud ? 'error' : 'warning',
      });
    }

    return check;
  }

  buildProviderCheck(
    descriptor: PublishingProviderEnvDescriptor,
    checkedAt: string,
  ): IPublishingSetupCheck {
    const check: IPublishingSetupCheck = {
      diagnostics: [],
      key: `provider.${descriptor.platform}`,
      label: `${descriptor.label} app credentials`,
      scope: 'provider',
      status: 'pass',
    };

    const missingEnvKeys = [
      ...this.findMissingRequirement(descriptor.clientIdKeys),
      ...this.findMissingRequirement(descriptor.clientSecretKeys),
    ];

    // Loose predicate on purpose: "is there an app here at all?" is what
    // separates the operator *choice* below from the operator *error* after it.
    if (!this.hasAnyProviderAppCredential(descriptor)) {
      const isCloud = isCloudDeployment();
      check.status = isCloud ? 'fail' : 'warn';
      check.diagnostics.push({
        checkedAt,
        classification: 'unsupported_self_host_mode',
        code: 'provider_not_configured',
        correctiveAction: `Register a ${descriptor.label} developer app and set ${missingEnvKeys.join(', ')} to publish to it.`,
        details: { missingEnvKeys },
        isRetryable: false,
        message: `${descriptor.label} has no OAuth app credentials, so no account can be connected.`,
        scope: 'provider',
        severity: isCloud ? 'error' : 'warning',
      });

      return check;
    }

    // Deliberately *not* deployment-sensitive, unlike the branch above (#2256).
    // Absent credentials are a legitimate self-host choice — nobody has to run
    // TikTok — and no credential can exist to be blocked. A half-configured app
    // is an operator error on a provider that may already hold live
    // credentials: it boots fine and then fails the OAuth exchange at connect
    // or refresh time. Downgrading it to a self-hosted `warning` would restore
    // `canSchedule` (severity drives `classifyPublishingReadiness`), letting a
    // post be scheduled against a provider that cannot publish it — the exact
    // silent-dispatch failure this checklist exists to surface.
    if (missingEnvKeys.length > 0) {
      check.status = 'fail';
      check.diagnostics.push({
        checkedAt,
        classification: 'misconfiguration',
        code: 'provider_partially_configured',
        correctiveAction: `Set ${missingEnvKeys.join(', ')} to complete the ${descriptor.label} app configuration.`,
        details: { missingEnvKeys },
        isRetryable: false,
        message: `${descriptor.label} is partially configured, which fails at connect time rather than at boot.`,
        scope: 'provider',
        severity: 'error',
      });
    }

    for (const envKey of descriptor.redirectUriKeys) {
      const value = this.readConfig(envKey);
      if (!value || this.parseAbsoluteUrl(value)) {
        continue;
      }

      check.status = 'fail';
      check.diagnostics.push({
        checkedAt,
        classification: 'misconfiguration',
        code: 'provider_redirect_uri_invalid',
        correctiveAction: `Set ${envKey} to the absolute callback URL registered in the ${descriptor.label} developer console.`,
        details: { envKey },
        isRetryable: false,
        message: `${descriptor.label} has a redirect URI that is not an absolute URL.`,
        scope: 'callback',
        severity: 'error',
      });
    }

    return check;
  }

  worstStatus(
    current: PublishingSetupCheckStatus,
    candidate: PublishingSetupCheckStatus,
  ): PublishingSetupCheckStatus {
    if (current === 'fail' || candidate === 'fail') {
      return 'fail';
    }

    return current === 'warn' || candidate === 'warn' ? 'warn' : current;
  }

  /**
   * Approval state itself is operator-owned configuration (#2086) and is never
   * queried live, so this only reports whether the question is settled: `pass`
   * when the platform has no review program, `fail` when there is no app to
   * review, and `unknown` when an unobservable approval stands between the
   * configured app and production publishing.
   */
  private resolveAppReviewStatus(
    descriptor: PublishingProviderEnvDescriptor,
    isConfigured: boolean,
  ): PublishingSetupCheckStatus {
    if (!isConfigured) {
      return 'fail';
    }

    return descriptor.requiresAppReview ? 'unknown' : 'pass';
  }

  /**
   * Informational only — an unverifiable review requirement must not degrade or
   * block a credential, so the diagnostic carries `info` severity and no
   * `correctiveAction`: a healthy credential must not inherit a `requiredAction`
   * from an FYI.
   */
  private buildAppReviewDiagnostics(
    descriptor: PublishingProviderEnvDescriptor,
    isConfigured: boolean,
    checkedAt: string,
  ): IPublishingSetupCheck['diagnostics'] {
    if (!isConfigured || !descriptor.requiresAppReview) {
      return [];
    }

    const program = descriptor.appReviewProgram ?? 'the platform review';

    return [
      {
        checkedAt,
        classification: 'missing_provider_approval',
        code: 'provider_app_review_unverified',
        details: { appReviewProgram: descriptor.appReviewProgram },
        isRetryable: false,
        message: `${descriptor.label} gates production publishing behind ${program}, which this installation cannot verify — confirm the app is approved for the publishing scopes it requests.`,
        scope: 'app_review',
        severity: 'info',
      },
    ];
  }

  /**
   * `true` when *anything* has been set for this provider. Answers "has the
   * operator started configuring this app?", which is the question that splits
   * `provider_not_configured` from `provider_partially_configured` — so the
   * OR is load-bearing, not a loose check awaiting a tightening.
   */
  private hasAnyProviderAppCredential(
    descriptor: PublishingProviderEnvDescriptor,
  ): boolean {
    return (
      this.hasAnyConfigured(descriptor.clientIdKeys) ||
      this.hasAnyConfigured(descriptor.clientSecretKeys)
    );
  }

  /**
   * `true` only when every requirement is satisfied. Answers "does a usable app
   * exist?", which is what app-review reporting needs: a client id with no
   * secret is not an app any provider console would review, so it must read
   * `fail` rather than inherit the configured app's `unknown`/`pass`.
   */
  private hasCompleteProviderAppCredentials(
    descriptor: PublishingProviderEnvDescriptor,
  ): boolean {
    return (
      this.hasAnyConfigured(descriptor.clientIdKeys) &&
      this.hasAnyConfigured(descriptor.clientSecretKeys)
    );
  }

  /** Reads presence only — the value never leaves this method. */
  private readConfig(key: string): string | null {
    const value = this.configService.get(key);
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed.length || isUnconfiguredSecret(trimmed)) {
      return null;
    }

    return trimmed;
  }

  private hasAnyConfigured(keys: readonly string[]): boolean {
    return keys.some((key) => this.readConfig(key) !== null);
  }

  /** Empty when the requirement is satisfied by any one of its keys. */
  private findMissingRequirement(keys: readonly string[]): string[] {
    return this.hasAnyConfigured(keys) ? [] : [...keys];
  }

  private parseAbsoluteUrl(value: string): URL | null {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }

  private isLoopbackHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    return (
      LOOPBACK_HOSTNAMES.has(normalized) || normalized.endsWith('.localhost')
    );
  }
}

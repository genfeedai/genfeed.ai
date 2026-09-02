import {
  SocialWarmupEnrollment as BaseSocialWarmupEnrollment,
  SocialWarmupEvent as BaseSocialWarmupEvent,
  SocialWarmupSignal as BaseSocialWarmupSignal,
} from '@genfeedai/client/models';
import type {
  ISocialWarmupEnrollment,
  ISocialWarmupEvent,
  ISocialWarmupSignal,
} from '@genfeedai/contracts/interfaces';
import { User } from '@models/auth/user.model';
import { Brand } from '@models/organization/brand.model';
import { Organization } from '@models/organization/organization.model';

export class SocialWarmupEvent extends BaseSocialWarmupEvent {
  constructor(partial: Partial<ISocialWarmupEvent> = {}) {
    super(partial);

    if (partial.organization && typeof partial.organization === 'object') {
      this.organization = new Organization(partial.organization);
    }
    if (partial.brand && typeof partial.brand === 'object') {
      this.brand = new Brand(partial.brand);
    }
    if (partial.actorUser && typeof partial.actorUser === 'object') {
      this.actorUser = new User(partial.actorUser);
    }
  }
}

export class SocialWarmupSignal extends BaseSocialWarmupSignal {
  constructor(partial: Partial<ISocialWarmupSignal> = {}) {
    super(partial);

    if (partial.organization && typeof partial.organization === 'object') {
      this.organization = new Organization(partial.organization);
    }
    if (partial.brand && typeof partial.brand === 'object') {
      this.brand = new Brand(partial.brand);
    }
  }
}

export class SocialWarmupEnrollment extends BaseSocialWarmupEnrollment {
  constructor(partial: Partial<ISocialWarmupEnrollment> = {}) {
    super(partial);

    if (partial.organization && typeof partial.organization === 'object') {
      this.organization = new Organization(partial.organization);
    }
    if (partial.brand && typeof partial.brand === 'object') {
      this.brand = new Brand(partial.brand);
    }
    if (partial.enrolledByUser && typeof partial.enrolledByUser === 'object') {
      this.enrolledByUser = new User(partial.enrolledByUser);
    }
    this.events = (partial.events ?? []).map(
      (event) => new SocialWarmupEvent(event),
    );
    this.signals = (partial.signals ?? []).map(
      (signal) => new SocialWarmupSignal(signal),
    );
  }
}

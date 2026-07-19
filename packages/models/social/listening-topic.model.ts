import {
  ListeningEvidence as BaseListeningEvidence,
  ListeningTopic as BaseListeningTopic,
  ListeningTopicSource as BaseListeningTopicSource,
} from '@genfeedai/client/models';
import type {
  IListeningEvidence,
  IListeningTopic,
  IListeningTopicSource,
} from '@genfeedai/interfaces';
import { User } from '@models/auth/user.model';
import { Brand } from '@models/organization/brand.model';
import { Organization } from '@models/organization/organization.model';
import { SocialSource } from './social-source.model';
import { SourcePost } from './source-post.model';

export class ListeningTopicSource extends BaseListeningTopicSource {
  constructor(partial: Partial<IListeningTopicSource> = {}) {
    super(partial);

    if (partial.organization && typeof partial.organization === 'object') {
      this.organization = new Organization(partial.organization);
    }
    if (partial.brand && typeof partial.brand === 'object') {
      this.brand = new Brand(partial.brand);
    }
    if (partial.source && typeof partial.source === 'object') {
      this.source = new SocialSource(partial.source);
    }
  }
}

export class ListeningTopic extends BaseListeningTopic {
  constructor(partial: Partial<IListeningTopic> = {}) {
    super(partial);

    if (partial.organization && typeof partial.organization === 'object') {
      this.organization = new Organization(partial.organization);
    }
    if (partial.brand && typeof partial.brand === 'object') {
      this.brand = new Brand(partial.brand);
    }
    if (partial.user && typeof partial.user === 'object') {
      this.user = new User(partial.user);
    }
    this.sources = (partial.sources ?? []).map(
      (source) => new ListeningTopicSource(source),
    );
  }
}

export class ListeningEvidence extends BaseListeningEvidence {
  constructor(partial: Partial<IListeningEvidence> = {}) {
    super(partial);

    if (partial.organization && typeof partial.organization === 'object') {
      this.organization = new Organization(partial.organization);
    }
    if (partial.brand && typeof partial.brand === 'object') {
      this.brand = new Brand(partial.brand);
    }
    if (partial.topic && typeof partial.topic === 'object') {
      this.topic = new ListeningTopic(partial.topic);
    }
    if (partial.topicSource && typeof partial.topicSource === 'object') {
      this.topicSource = new ListeningTopicSource(partial.topicSource);
    }
    if (partial.sourcePost && typeof partial.sourcePost === 'object') {
      this.sourcePost = new SourcePost(partial.sourcePost);
    }
  }
}

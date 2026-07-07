import {
  LIFECYCLE_SYSTEM_EMAILS,
  type LifecycleSystemEmailDefinition,
} from '@genfeedai/constants';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminSystemEmailsService {
  list(): LifecycleSystemEmailDefinition[] {
    return LIFECYCLE_SYSTEM_EMAILS.map((email) => ({
      ...email,
      paragraphs: [...email.paragraphs],
      skipRules: [...email.skipRules],
    }));
  }
}

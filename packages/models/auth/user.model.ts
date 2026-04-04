import { User as BaseUser } from '@genfeedai/client/models';

export class User extends BaseUser {
  get fullName(): string {
    const name = `${this.firstName ?? ''} ${this.lastName ?? ''}`.trim();
    return name || '-';
  }
}

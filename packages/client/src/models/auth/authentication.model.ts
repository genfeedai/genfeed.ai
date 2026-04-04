import type { IAuthentication } from '@genfeedai/interfaces';

export class Authentication implements IAuthentication {
  public declare token: string;

  constructor(data: Partial<IAuthentication> = {}) {
    Object.assign(this, data);
  }
}

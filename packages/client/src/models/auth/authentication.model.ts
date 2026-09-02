import type { IAuthentication } from '@genfeedai/contracts/interfaces';

export class Authentication implements IAuthentication {
  public declare token: string;

  constructor(data: Partial<IAuthentication> = {}) {
    Object.assign(this, data);
  }
}

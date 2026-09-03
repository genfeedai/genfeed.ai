import type { IAuthentication } from '@genfeedai/contracts/interfaces';

export class Authentication implements IAuthentication {
  declare public token: string;

  constructor(data: Partial<IAuthentication> = {}) {
    Object.assign(this, data);
  }
}

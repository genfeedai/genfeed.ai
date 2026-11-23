export interface ISignupIpLocation {
  city: string | null;
  country: string | null;
  region: string | null;
}

export interface IUserSignupNetwork {
  id: string;
  ipAddress: string | null;
  location: ISignupIpLocation | null;
}

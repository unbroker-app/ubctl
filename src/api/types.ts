/** Shapes of the API responses the CLI consumes. Extended in later PRs. */

export interface Profile {
  id: string;
  name: string;
  email: string;
}

export interface ProfileResponse {
  profile: Profile;
  orgId: string;
}

export interface Account {
  uuid: string;
  email: string;
  name: string;
  status: string;
  team: { name: string; uuid: string };
}

export interface AccountResponse {
  account: Account;
}

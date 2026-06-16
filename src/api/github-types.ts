/** GitHub-integration resource shapes — mirrors the API's apps/github module. */

export interface GithubInstallation {
  installationId: number;
  accountLogin: string;
}

export interface GithubRepo {
  /** "owner/repo". */
  fullName: string;
  htmlUrl: string;
  private: boolean;
  defaultBranch: string;
}

export interface GithubConfig {
  enabled: boolean;
  installUrl: string | null;
  authorizeUrl: string | null;
}

export interface GithubInstallationsResponse {
  installations: GithubInstallation[];
}
export interface GithubReposResponse {
  repos: GithubRepo[];
}
export interface GithubBranchesResponse {
  branches: string[];
}

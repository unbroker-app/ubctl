/** Shapes of the API responses the CLI consumes. Extended in later PRs. */

export interface Profile {
  id: string;
  name: string;
  email: string;
  identityType?: "user" | "api_token";
  tokenName?: string;
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
  identityType?: "user" | "api_token";
  tokenName?: string;
}

export interface AccountResponse {
  account: Account;
}

/* ----- Apps / PaaS ----- */

export type Framework =
  | "next"
  | "astro"
  | "node"
  | "react"
  | "vue"
  | "vite"
  | "static";

export type ServiceStatus = "running" | "building" | "failed" | "stopped";

export type DeploymentStatus =
  | "queued"
  | "building"
  | "deploying"
  | "live"
  | "failed"
  | "superseded";

export interface Project {
  id: string;
  name: string;
  slug: string;
  createdAt: number;
}

export interface Service {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  repoUrl: string;
  branch: string;
  framework: Framework;
  port: number;
  status: ServiceStatus;
  needsRedeploy: boolean;
  autoDeploy: boolean;
  liveDeploymentId: string | null;
  url: string;
  routed: boolean;
  domains: string[];
  createdAt: number;
  /** Page access control (the "Security" tab); present on the service object. */
  accessMode?: "public" | "password" | "organization";
  hasPassword?: boolean;
}

export interface DeploymentSummary {
  id: string;
  serviceId: string;
  trigger: string;
  commitSha: string | null;
  status: DeploymentStatus;
  createdAt: number;
  finishedAt: number | null;
}

export interface Deployment extends DeploymentSummary {
  buildLog: string;
}

export interface EnvVar {
  id: string;
  key: string;
  maskedValue: string;
  createdAt: number;
}

export type DomainStatus = "pending" | "active" | "error" | string;

export interface Domain {
  id: string;
  serviceId: string;
  hostname: string;
  status: DomainStatus;
  createdAt: number;
}

export interface PodMetrics {
  name: string;
  cpuMillicores: number;
  memoryMiB: number;
  ready: boolean;
}

export interface Metrics {
  replicas: { ready: number; desired: number };
  pods: PodMetrics[];
  limits: { cpuMillicores: number; memoryMiB: number };
}

export interface ProjectsResponse {
  projects: Project[];
}
export interface ProjectResponse {
  project: Project;
}
export interface ServicesResponse {
  services: Service[];
}
export interface ServiceResponse {
  service: Service;
}
export interface DeploymentsResponse {
  deployments: DeploymentSummary[];
}
export interface DeploymentResponse {
  deployment: Deployment;
}
export interface EnvVarsResponse {
  envVars: EnvVar[];
}
export interface EnvVarResponse {
  envVar: EnvVar;
}
export interface DomainsResponse {
  domains: Domain[];
}
export interface DomainResponse {
  domain: Domain;
}
export interface LogsResponse {
  logs: string[];
}
export interface MetricsResponse {
  metrics: Metrics | null;
}

/* ----- API tokens ----- */

export interface ApiToken {
  id: string;
  name: string;
  scope: string;
  prefix: string;
  lastUsed: string | null;
}

export interface TokensResponse {
  tokens: ApiToken[];
}

/** Creation returns the plaintext secret exactly once. */
export interface CreateTokenResponse {
  token: ApiToken;
  secret: string;
}

/* ----- Account & organizations ----- */

export interface UsageSummary {
  monthToDate: number;
  projected: number;
  runRate: number;
  ledger: number;
  vcpus: number;
  memoryGb: number;
  storageGb: number;
  droplets: number;
  dropletLimit: number;
}

export interface Invoice {
  id: string;
  period: string;
  amount: number;
  status: "Paid" | "Due" | "Pending";
}

export interface ActivityEvent {
  id: string;
  time: string;
  actor: string;
  action: string;
  target: string;
  kind: "create" | "delete" | "update" | "deploy" | "alert";
}

export interface Organization {
  id: string;
  name: string;
  kind: "personal" | "team";
  plan: string;
  color: string;
}

export interface UsageResponse {
  usage: UsageSummary;
}
export interface InvoicesResponse {
  invoices: Invoice[];
}
export interface ActivityResponse {
  activity: ActivityEvent[];
}
export interface OrganizationsResponse {
  organizations: Organization[];
}
export interface OrganizationResponse {
  organization: Organization;
}

export interface Billing {
  billingEmail: string;
  company: string;
  address: string;
  city: string;
  country: string;
  taxId: string;
}
export interface BillingResponse {
  billing: Billing;
}

/** Whether the org has a cloud provider (DigitalOcean) connected. */
export interface ConnectionStatusResponse {
  connected: boolean;
}

export interface BandwidthPoint {
  label: string;
  value: number;
}
export interface Bandwidth {
  points: BandwidthPoint[];
  deltaPct: number;
  unit: string;
}
export interface BandwidthResponse {
  bandwidth: Bandwidth;
}

/** Anomaly-alerts state. `anomalies` is only present on the (web-only) toggle. */
export interface AlertsResponse {
  enabled: boolean;
  anomalies?: number;
}

/* ----- Notifications ----- */

export interface Notification {
  id: string;
  title: string;
  body: string | null;
  tone: string;
  read: boolean;
  time: number;
}
export interface NotificationsResponse {
  notifications: Notification[];
  unread: number;
}

/* ----- Team & invitations ----- */

export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
}
export interface MembersResponse {
  members: Member[];
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  invitedByName: string | null;
  createdAt: number;
  expiresAt: number;
}
export interface InvitationsResponse {
  invitations: Invitation[];
}
export interface InvitationResponse {
  invitation: Invitation;
}

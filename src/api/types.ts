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
  | "nixpacks"
  | "next"
  | "astro"
  | "node"
  | "worker"
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
  repoUrl: string | null;
  branch: string | null;
  framework: Framework | null;
  serviceType?: "repo" | "image" | "upload";
  imageRef?: string | null;
  host: string;
  volumePath?: string | null;
  volumeSizeGb?: number | null;
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
  /* Scale configuration (PATCH /apps/services/:id; applied on next deploy). */
  replicas?: number;
  /** Per-replica CPU limit in millicores; null = platform default. */
  cpuLimit?: number | null;
  /** Per-replica memory limit in MiB; null = platform default. */
  memoryLimit?: number | null;
  autoscale?: boolean;
  minReplicas?: number | null;
  maxReplicas?: number | null;
  targetCpuPercent?: number | null;
  targetMemoryPercent?: number | null;
  scaleOnCpu?: boolean;
  scaleWindowEnabled?: boolean;
  scaleWindowMin?: number | null;
  scaleWindowStart?: string | null;
  scaleWindowEnd?: string | null;
  scaleWindowDays?: string | null;
  scaleWindowTz?: string | null;
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
  dns?: { type: "CNAME"; name: string; value: string };
}

export interface PodMetrics {
  pod: string;
  /** null while the metrics server has no sample for the pod yet. */
  cpuMillicores: number | null;
  memoryMiB: number | null;
  restarts: number;
  /** Container state, e.g. "Running" or "CrashLoopBackOff". */
  state: string;
  rxBytes?: number | null;
  txBytes?: number | null;
}

export interface Metrics {
  replicas: { ready: number; desired: number };
  pods: PodMetrics[];
  /** Per-pod limits actually applied to the running workload. */
  limits: { cpuMillicores: number; memoryMiB: number };
  overhead?: { cpuMillicores: number; memoryMiB: number };
}

export type MetricRange = "15m" | "1h" | "6h" | "24h" | "7d" | "30d";

export interface MetricSeries {
  name: string;
  unit: "millicores" | "MiB" | "bytes/s" | "count" | "%";
  agg: "avg" | "max" | "min";
  /** [epoch ms, value] pairs. */
  points: [number, number][];
}

export interface MetricSeriesResult {
  from: number;
  to: number;
  step: number;
  source: "raw" | "hourly";
  series: MetricSeries[];
  latestSampleAt?: number | null;
}

/* ----- Traffic analytics ----- */

export type TrafficRange = "24h" | "7d" | "30d" | "90d" | "365d";

export type TrafficDimension =
  | "path"
  | "page"
  | "status"
  | "method"
  | "country"
  | "referer"
  | "browser"
  | "os"
  | "device"
  | "protocol"
  | "scheme"
  | "tls"
  | "cache"
  | "bot"
  | "utm_source"
  | "utm_medium"
  | "utm_campaign";

export interface TrafficTotals {
  requests: number;
  bytesIn: number;
  bytesOut: number;
  s2xx: number;
  s3xx: number;
  s4xx: number;
  s5xx: number;
  pageviews: number;
  bots: number;
  probes: number;
  uniques: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

export interface TrafficBucket {
  bucket: number;
  requests: number;
  bytesOut: number;
  s2xx: number;
  s3xx: number;
  s4xx: number;
  s5xx: number;
  probes: number;
  pageviews: number;
  uniques: number;
  p95: number | null;
}

export interface TrafficOverview {
  range: TrafficRange;
  from: number;
  to: number;
  step: number;
  totals: TrafficTotals;
  buckets: TrafficBucket[];
  hosts: { host: string; requests: number; bytesOut: number }[];
  services: {
    serviceId: string;
    requests: number;
    bytesOut: number;
    s4xx: number;
    s5xx: number;
  }[];
  /** True when the cell sees no client IPs: visitors/countries are unknown. */
  visitorsUnavailable: boolean;
  /** Distinct visitors in the last 5 minutes. */
  online: number;
}

export interface TrafficBreakdownRow {
  value: string;
  requests: number;
  bytesOut: number;
  /** Share of the total, 0..1. */
  share: number;
  pageviews?: number;
  s2xx?: number;
  s3xx?: number;
  s4xx?: number;
  s5xx?: number;
  p95?: number | null;
}

export interface TrafficBreakdown {
  dimension: TrafficDimension;
  range: TrafficRange;
  from: number;
  to: number;
  rows: TrafficBreakdownRow[];
  other: TrafficBreakdownRow | null;
  approximate: boolean;
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
export interface ServiceConnection {
  protocol: string;
  username: string;
  password: string;
  database: string;
  host: string;
  port: number;
  uri: string;
}
export interface ServiceConnectionResponse {
  connection: ServiceConnection;
}
export interface TunnelTicket {
  ticket: string;
  expiresAt: number;
  url: string;
  port: number;
  credentials: {
    protocol: string;
    username: string;
    password: string;
    database: string;
  };
}
export interface SelfHostedDatabaseResponse {
  service: Service;
  credentials: { key: string; value: string }[];
}
export interface BackupDestination {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  hasCredentials: boolean;
  createdAt: number;
  updatedAt: number;
}
export interface BackupSchedule {
  id: string;
  serviceId: string;
  destinationId: string;
  cron: string;
  retentionCount: number;
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
}
export interface BackupRun {
  id: string;
  serviceId: string;
  destinationId: string;
  sourceBackupId: string | null;
  operation: "backup" | "restore";
  trigger: "manual" | "scheduled";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  engine: "postgres" | "mysql" | "mongodb" | "redis" | "volume";
  objectKey: string | null;
  sizeBytes: number | null;
  log: string;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
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
export interface MetricSample {
  capturedAt: number;
  readyReplicas: number;
  desiredReplicas: number;
  cpuMillicores: number | null;
  memoryMiB: number | null;
  restarts: number;
  unhealthyPods: number;
}
export interface MetricsHistoryResponse {
  metrics: MetricSample[];
}
export interface RuntimeLogLine {
  id: string;
  observedAt: number;
  line: string;
}
export interface LogsHistoryResponse {
  logs: RuntimeLogLine[];
  retentionMs: number;
}
export interface TlsStatus {
  ready: boolean;
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
  /** Servers in use (the API keeps its historical field name). */
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
  /** Capabilities of the cell the organization runs on. */
  cell?: OrgCell;
}

export interface OrgCell {
  id: string;
  dedicated: boolean;
  autoscaling: boolean;
  scaleWindows: boolean;
  /** Replica ceiling for every scale field on this cell. */
  maxReplicas: number;
  pageAccessControl: boolean;
  trafficAnalytics: boolean;
  liveMetrics: boolean;
  costEstimates: boolean;
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

export interface ChargeItem {
  id: string;
  name: string;
  type: string;
  dailyRate: number;
  days: number;
  accrued: number;
  projected: number;
}
export interface CurrentCharges {
  cycle: {
    start: number;
    end: number;
    nextChargeAt: number;
    daysInCycle: number;
    dayOfCycle: number;
  };
  items: ChargeItem[];
  ledger: number;
  accruedTotal: number;
  projectedTotal: number;
}
export interface CurrentChargesResponse {
  charges: CurrentCharges;
}
export interface UsageProductLine {
  product: string;
  label: string;
  group: string;
  charge: number;
  qty: number | null;
  unit: string | null;
  spark: number[];
}
export interface UsageBreakdown {
  month: string;
  current: boolean;
  products: UsageProductLine[];
  credit: { included: number; used: number };
  onDemand: number;
  accrued: number;
  projected: number;
  availableMonths: string[];
}
export interface UsageBreakdownResponse {
  usage: UsageBreakdown;
}
export interface CliUsageSummary {
  since: string;
  requests: number;
  errors: number;
  errorRate: number;
  averageLatencyMs: number;
  byVersion: { version: string; requests: number }[];
  byRoute: { route: string; requests: number }[];
}
export interface CliUsageResponse {
  usage: CliUsageSummary;
}
export interface CostBudget {
  amount: number;
  thresholds: number[];
  includeForecast: boolean;
  emailEnabled: boolean;
  enabled: boolean;
}
export interface CostBudgetResponse {
  budget?: CostBudget | null;
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

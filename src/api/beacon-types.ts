/** Beacon (realtime pub/sub) resource shapes — mirrors the API's beacon module. */

export interface BeaconProject {
  id: string;
  name: string;
  /** Gateway tenant id; null until provisioned. */
  externalId: string | null;
  /** Public key clients use to connect; null until provisioned. */
  publicKey: string | null;
  status: string;
  createdAt: number;
}

export interface BeaconSettings {
  allowedOrigins: string[];
  allowAnonymous: boolean;
  anonymousSubscribe: string[];
}

export interface BeaconUsage {
  month: string;
  messages: number;
  bytes: number;
  gigabytes: number;
  peakConnections: number;
  currentConnections: number;
  estimatedCost: number;
  /** true = live counters from the gateway; false = hourly snapshot. */
  live: boolean;
  prices: {
    perMillionMessages: number;
    perPeakConnection: number;
    perGb: number;
  };
}

export interface BeaconChannel {
  channel: string;
  subscribers: number;
}

export interface BeaconChannelGroup {
  name: string;
  channels: number;
  subscribers: number;
}

export interface BeaconChannelSummary {
  total: number;
  subscribers: number;
  groups: BeaconChannelGroup[];
}

export interface BeaconChannelValue {
  channel: string;
  subscribers: number;
  lastValue?: unknown;
}

export interface BeaconProjectsResponse {
  projects: BeaconProject[];
}
export interface BeaconProjectResponse {
  project: BeaconProject;
}
export interface BeaconSettingsResponse {
  settings: BeaconSettings;
}
export interface BeaconUsageResponse {
  usage: BeaconUsage;
}
export interface BeaconChannelsResponse {
  channels: BeaconChannel[];
}
export interface BeaconChannelSummaryResponse {
  summary: BeaconChannelSummary;
}
export interface BeaconChannelValueResponse {
  channel: BeaconChannelValue;
}
/** A short-lived test token for the "try it now" flow. */
export interface BeaconTokenResponse {
  token: string;
}

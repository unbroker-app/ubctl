/** DigitalOcean-reseller resource shapes (the fields the CLI displays). */

export interface Droplet {
  id: string;
  name: string;
  status: string;
  region: string;
  image: string;
  size: string;
  vcpus: number;
  memoryGb: number;
  diskGb: number;
  ipv4: string;
}

export interface DatabaseCluster {
  id: string;
  name: string;
  engine: string;
  version: string;
  status: string;
  region: string;
  nodes: number;
  size: string;
  storageGb: number;
}

/** A login on a managed database cluster. */
export interface DatabaseUser {
  name: string;
  role: string;
}

/** A logical database (schema) inside a cluster. */
export interface LogicalDb {
  name: string;
}

/** Connection credentials for a cluster — never tabulated, printed as JSON. */
export interface DatabaseConnection {
  uri: string;
  host: string;
  port: number;
  database: string;
  ssl: boolean;
  available: boolean;
  simulated: boolean;
}

/** Point-in-time cluster metrics; absent on simulated/idle clusters. */
export interface DatabaseMetrics {
  available: boolean;
  simulated?: boolean;
  cpuPct?: number;
  memPct?: number;
  load1?: number;
  load5?: number;
  load15?: number;
}

export interface DropletsResponse {
  droplets: Droplet[];
}
export interface DropletResponse {
  droplet: Droplet;
}
export interface DatabasesResponse {
  databases: DatabaseCluster[];
}
export interface DatabaseResponse {
  database: DatabaseCluster;
}
export interface ConnectionResponse {
  connection: DatabaseConnection;
}
export interface DatabaseUsersResponse {
  users: DatabaseUser[];
}
export interface DatabaseUserResponse {
  user: DatabaseUser;
}
export interface LogicalDbsResponse {
  dbs: LogicalDb[];
}
export interface LogicalDbResponse {
  db: LogicalDb;
}
export interface DatabaseMetricsResponse {
  metrics: DatabaseMetrics;
}

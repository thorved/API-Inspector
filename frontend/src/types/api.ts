export type Project = {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectsResponse = {
  items: Project[];
};

export type CreateProjectInput = {
  name: string;
  slug: string;
  baseUrl: string;
};

export type MutationResult = {
  deleted?: boolean;
  deletedCount?: number;
};

export type LogSummary = {
  id: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  method: string;
  path: string;
  fullUrl: string;
  responseStatus: number;
  durationMs: number;
  hasError: boolean;
  errorMessage?: string;
  requestContentType: string;
  responseContentType: string;
  createdAt: string;
};

export type LogListResponse = {
  items: LogSummary[];
  nextCursor?: string;
};

export type BodyPreview = {
  preview: string;
  size: number;
  contentType: string;
  truncated: boolean;
  binary: boolean;
};

export type UploadedFile = {
  fieldName: string;
  fileName: string;
  contentType: string;
  size: number;
  savedPath: string;
};

export type LogDetail = {
  id: string;
  project: {
    id: string;
    name: string;
    slug: string;
  };
  request: {
    method: string;
    url: string;
    path: string;
    query: Record<string, string[]>;
    headers: Record<string, string[]>;
    uploadedFiles: UploadedFile[];
    body: BodyPreview;
  };
  response: {
    status: number;
    headers: Record<string, string[]>;
    body: BodyPreview;
  };
  durationMs: number;
  error?: string;
  clientIp: string;
  userAgent: string;
  createdAt: string;
};

export type StatsResponse = {
  activeProjects: number;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  averageLatencyMs: number;
  recentFailures: LogSummary[];
  lastTrafficAt?: string;
};

export type TrafficEvent = {
  type: "traffic.created";
  item: LogSummary;
};

export type PendingWatchRequest = {
  id: string;
  projectSlug: string;
  method: string;
  path: string;
  fullUrl: string;
  query: Record<string, string[]>;
  headers: Record<string, string[]>;
  body: BodyPreview;
  clientIp: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
};

export type WatchState = {
  projectSlug: string;
  enabled: boolean;
  timeoutSeconds: number;
  pending: PendingWatchRequest[];
};

export type WatchRequestedEvent = {
  type: "watch.requested";
  request: PendingWatchRequest;
};

export type WatchResolvedEvent = {
  type: "watch.resolved";
  projectSlug: string;
  requestId: string;
  action: string;
};

export type WatchStateChangedEvent = {
  type: "watch.state.changed";
  state: WatchState;
};

export type WatchEvent =
  | WatchRequestedEvent
  | WatchResolvedEvent
  | WatchStateChangedEvent;

export type AppSettings = {
  port: number;
  databasePath: string;
  bodyPreviewLimit: number;
  logPageSize: number;
  upstreamTimeoutSeconds: number;
  watchTimeoutSeconds: number;
};

export type SettingsSaveResponse = {
  settings: AppSettings;
  restartRequired: boolean;
  message: string;
};

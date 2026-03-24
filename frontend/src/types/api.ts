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

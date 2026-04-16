import type {
  AppSettings,
  CreateProjectInput,
  LogDetail,
  LogListResponse,
  MutationResult,
  Project,
  ProjectsResponse,
  SettingsSaveResponse,
  StatsResponse,
  WatchState,
} from "@/types/api";

function apiBaseUrl() {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    const port = window.location.port;
    if (
      (hostname === "localhost" || hostname === "127.0.0.1") &&
      port === "3000"
    ) {
      return "http://localhost:8080";
    }
  }

  return "";
}

export function buildApiUrl(
  pathname: string,
  params?: Record<string, string | undefined>,
) {
  const base = apiBaseUrl();
  const url = base
    ? new URL(pathname, base.endsWith("/") ? base : `${base}/`)
    : new URL(pathname, window.location.origin);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  if (!base) {
    return `${url.pathname}${url.search}`;
  }

  return url.toString();
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Unable to reach the API server at ${input}. Make sure the Go backend is running and CORS is configured for the frontend origin.`,
      );
    }
    throw error;
  }

  if (!response.ok) {
    let message = "Request failed";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {}
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function listProjects() {
  return request<ProjectsResponse>(buildApiUrl("/api/projects"));
}

export function createProject(input: CreateProjectInput) {
  return request<Project>(buildApiUrl("/api/projects"), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProject(currentSlug: string, input: CreateProjectInput) {
  return request<Project>(buildApiUrl(`/api/projects/${currentSlug}`), {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteProject(slug: string) {
  return request<MutationResult>(buildApiUrl(`/api/projects/${slug}`), {
    method: "DELETE",
  });
}

export function listLogs(filters: {
  project?: string;
  method?: string;
  status?: string;
  search?: string;
  cursor?: string;
}) {
  return request<LogListResponse>(buildApiUrl("/api/logs", filters));
}

export function getLog(id: string) {
  return request<LogDetail>(buildApiUrl(`/api/logs/${id}`));
}

export function deleteLog(id: string) {
  return request<MutationResult>(buildApiUrl(`/api/logs/${id}`), {
    method: "DELETE",
  });
}

export function clearLogs(project?: string) {
  return request<MutationResult>(buildApiUrl("/api/logs", { project }), {
    method: "DELETE",
  });
}

export function getStats(project?: string) {
  return request<StatsResponse>(buildApiUrl("/api/stats", { project }));
}

export function getSettings() {
  return request<AppSettings>(buildApiUrl("/api/settings"));
}

export function updateSettings(input: AppSettings) {
  return request<SettingsSaveResponse>(buildApiUrl("/api/settings"), {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function getWatchState(project: string) {
  return request<WatchState>(buildApiUrl("/api/watch", { project }));
}

export function updateWatchState(projectSlug: string, enabled: boolean) {
  return request<WatchState>(buildApiUrl("/api/watch"), {
    method: "PUT",
    body: JSON.stringify({ projectSlug, enabled }),
  });
}

export function resolveWatchRequest(id: string, action: "approve" | "deny") {
  return request<{ resolved: boolean; action: string }>(
    buildApiUrl(`/api/watch/requests/${id}/decision`),
    {
      method: "POST",
      body: JSON.stringify({ action }),
    },
  );
}

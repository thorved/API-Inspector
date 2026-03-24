"use client";

import JsonView from "@uiw/react-json-view";
import { darkTheme as jsonDarkTheme } from "@uiw/react-json-view/dark";
import { lightTheme as jsonLightTheme } from "@uiw/react-json-view/light";
import Link from "next/link";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  buildApiUrl,
  createProject,
  getLog,
  getStats,
  listLogs,
  listProjects,
} from "@/lib/api";
import type {
  CreateProjectInput,
  LogDetail,
  LogSummary,
  Project,
  StatsResponse,
  TrafficEvent,
} from "@/types/api";

type DashboardShellProps = {
  initialView?: "overview" | "projects";
};

type WorkspaceTheme = "light" | "dark";

const methodOptions = ["ALL", "GET", "POST", "PUT", "PATCH", "DELETE"];
const statusOptions = [
  { label: "All", value: "" },
  { label: "Success", value: "success" },
  { label: "Error", value: "error" },
];

const emptyStats: StatsResponse = {
  activeProjects: 0,
  totalRequests: 0,
  successCount: 0,
  errorCount: 0,
  averageLatencyMs: 0,
  recentFailures: [],
};

function updateQuery(values: { project?: string; log?: string }) {
  const params = new URLSearchParams(window.location.search);
  if (values.project !== undefined) {
    if (values.project) {
      params.set("project", values.project);
    } else {
      params.delete("project");
    }
  }
  if (values.log !== undefined) {
    if (values.log) {
      params.set("log", values.log);
    } else {
      params.delete("log");
    }
  }

  const nextSearch = params.toString();
  const nextURL = nextSearch
    ? `${window.location.pathname}?${nextSearch}`
    : window.location.pathname;
  window.history.replaceState(null, "", nextURL);
}

export function DashboardShell({
  initialView = "overview",
}: DashboardShellProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedLog, setSelectedLog] = useState("");
  const [logs, setLogs] = useState<LogSummary[]>([]);
  const [stats, setStats] = useState<StatsResponse>(emptyStats);
  const [detail, setDetail] = useState<LogDetail | null>(null);
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("ALL");
  const [status, setStatus] = useState("");
  const [nextCursor, setNextCursor] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [liveFeed, setLiveFeed] = useState<LogSummary[]>([]);
  const [view, setView] = useState<"overview" | "projects">(initialView);
  const [form, setForm] = useState<CreateProjectInput>({
    name: "",
    slug: "",
    baseUrl: "",
  });
  const [theme, setTheme] = useState<WorkspaceTheme>("light");
  const deferredSearch = useDeferredValue(search);

  const selectedProjectRecord = useMemo(
    () => projects.find((project) => project.slug === selectedProject) ?? null,
    [projects, selectedProject],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSelectedProject(params.get("project") ?? "");
    setSelectedLog(params.get("log") ?? "");
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(
      "proxylens-workspace-theme",
    ) as WorkspaceTheme | null;
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("proxylens-workspace-theme", theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      try {
        const payload = await listProjects();
        if (cancelled) {
          return;
        }
        setProjects(payload.items);
        setErrorMessage("");
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(toMessage(error));
        }
      }
    }

    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!projects.length) {
      return;
    }

    const exists = projects.some((project) => project.slug === selectedProject);
    if (!selectedProject || !exists) {
      const nextProject = projects[0].slug;
      startTransition(() => {
        setSelectedProject(nextProject);
        setSelectedLog("");
        updateQuery({ project: nextProject, log: "" });
      });
    }
  }, [projects, selectedProject]);

  useEffect(() => {
    if (!selectedProject) {
      setLogs([]);
      setStats(emptyStats);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    async function loadTraffic() {
      try {
        const [logsPayload, statsPayload] = await Promise.all([
          listLogs({
            project: selectedProject,
            method: method === "ALL" ? "" : method,
            status,
            search: deferredSearch,
          }),
          getStats(selectedProject),
        ]);

        if (cancelled) {
          return;
        }

        setLogs(logsPayload.items);
        setNextCursor(logsPayload.nextCursor ?? "");
        setStats(statsPayload);
        setErrorMessage("");
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(toMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadTraffic();
    return () => {
      cancelled = true;
    };
  }, [deferredSearch, method, selectedProject, status]);

  useEffect(() => {
    if (!selectedLog) {
      setDetail(null);
      return;
    }

    let cancelled = false;

    async function loadLogDetail() {
      try {
        const payload = await getLog(selectedLog);
        if (cancelled) {
          return;
        }
        setDetail(payload);
        setErrorMessage("");
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(toMessage(error));
        }
      }
    }

    void loadLogDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedLog]);

  useEffect(() => {
    const source = new EventSource(buildApiUrl("/api/events/traffic"));

    const handleTraffic = (event: MessageEvent) => {
      const payload = JSON.parse(event.data) as TrafficEvent;
      const item = payload.item;

      setLiveFeed((current) =>
        [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 8),
      );
      if (selectedProject && item.projectSlug !== selectedProject) {
        return;
      }

      void Promise.all([
        listLogs({
          project: selectedProject,
          method: method === "ALL" ? "" : method,
          status,
          search: deferredSearch,
        }),
        selectedProject
          ? getStats(selectedProject)
          : Promise.resolve(emptyStats),
      ])
        .then(([logsPayload, statsPayload]) => {
          setLogs(logsPayload.items);
          setNextCursor(logsPayload.nextCursor ?? "");
          setStats(statsPayload as StatsResponse);
          setErrorMessage("");
        })
        .catch((error) => {
          setErrorMessage(toMessage(error));
        });
    };

    source.addEventListener("traffic.created", handleTraffic);
    source.onerror = () => {
      source.close();
    };

    return () => {
      source.removeEventListener("traffic.created", handleTraffic);
      source.close();
    };
  }, [deferredSearch, method, selectedProject, status]);

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);

    try {
      const created = await createProject(form);
      const projectsPayload = await listProjects();
      setForm({ name: "", slug: "", baseUrl: "" });
      setProjects(projectsPayload.items);
      setErrorMessage("");
      startTransition(() => {
        setView("overview");
        setSelectedProject(created.slug);
        updateQuery({ project: created.slug, log: "" });
      });
    } catch (error) {
      setErrorMessage(toMessage(error));
    } finally {
      setIsCreating(false);
    }
  }

  function handleProjectChange(slug: string) {
    startTransition(() => {
      setSelectedProject(slug);
      setSelectedLog("");
      updateQuery({ project: slug, log: "" });
    });
  }

  function handleSelectLog(logId: string) {
    startTransition(() => {
      setSelectedLog(logId);
      updateQuery({ project: selectedProject, log: logId });
    });
  }

  async function handleLoadMore() {
    try {
      const payload = await listLogs({
        project: selectedProject,
        method: method === "ALL" ? "" : method,
        status,
        search: deferredSearch,
        cursor: nextCursor,
      });
      setNextCursor(payload.nextCursor ?? "");
      setLogs((current) => [...current, ...payload.items]);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(toMessage(error));
    }
  }

  return (
    <div
      className={
        view === "overview" ? `inspector-page theme-${theme}` : "clean-page"
      }
    >
      <div className="mx-auto flex min-h-screen w-full max-w-none flex-col gap-6 px-4 py-4 sm:px-5 lg:px-6">
        <nav className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={
                view === "overview" ? "tab-button active" : "tab-button"
              }
              onClick={() => setView("overview")}
              type="button"
            >
              Traffic workspace
            </button>
            <button
              className={
                view === "projects" ? "tab-button active" : "tab-button"
              }
              onClick={() => setView("projects")}
              type="button"
            >
              Projects
            </button>
            <Link className="tab-button" href="/projects">
              Projects page
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={theme === "light" ? "tab-button active" : "tab-button"}
              onClick={() => setTheme("light")}
              type="button"
            >
              Light
            </button>
            <button
              className={theme === "dark" ? "tab-button active" : "tab-button"}
              onClick={() => setTheme("dark")}
              type="button"
            >
              Dark
            </button>
          </div>
        </nav>

        {errorMessage ? (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-200">
            {errorMessage}
          </section>
        ) : null}

        {view === "projects" ? (
          <section className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <ProjectForm
              form={form}
              isCreating={isCreating}
              onChange={setForm}
              onSubmit={handleCreateProject}
            />
            <ProjectList
              projects={projects}
              selectedProject={selectedProject}
              onSelectProject={handleProjectChange}
            />
          </section>
        ) : (
          <div className="inspector-shell">
            <aside className="inspector-sidebar">
              <div className="inspector-sidebar-top">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] inspector-muted">
                      Inbox
                    </div>
                    <div className="mt-1 text-sm font-semibold inspector-strong">
                      {logs.length} request{logs.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  {isLoading ? <span className="pulse-dot" /> : null}
                </div>
                <div className="mt-3 space-y-2">
                  <select
                    className="inspector-field"
                    value={selectedProject}
                    onChange={(event) =>
                      handleProjectChange(event.target.value)
                    }
                  >
                    {projects.length ? null : (
                      <option value="">No projects yet</option>
                    )}
                    {projects.map((project) => (
                      <option key={project.id} value={project.slug}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="inspector-field"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search query"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className="inspector-field"
                      value={method}
                      onChange={(event) => setMethod(event.target.value)}
                    >
                      {methodOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <select
                      className="inspector-field"
                      value={status}
                      onChange={(event) => setStatus(event.target.value)}
                    >
                      {statusOptions.map((option) => (
                        <option key={option.label} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {logs.length ? (
                  logs.map((log) => (
                    <button
                      className={`sidebar-request ${
                        selectedLog === log.id ? "active" : ""
                      }`}
                      key={log.id}
                      onClick={() => handleSelectLog(log.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="method-pill">{log.method}</span>
                        <span className="text-xs inspector-muted">
                          {formatTime(log.createdAt)}
                        </span>
                      </div>
                      <div className="mt-3 text-left">
                        <div className="truncate font-medium inspector-strong">
                          {log.path}
                        </div>
                        <div className="mt-1 truncate text-xs inspector-muted">
                          {log.fullUrl}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <StatusBadge
                          status={log.responseStatus}
                          hasError={log.hasError}
                        />
                        <span className="text-xs inspector-soft">
                          {log.durationMs} ms
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-6 text-sm inspector-muted">
                    No traffic yet. Proxy a request through the selected project
                    to populate this inbox.
                  </div>
                )}
              </div>

              <div className="inspector-sidebar-bottom">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] inspector-muted">
                  <span>Live feed</span>
                  <span>{liveFeed.length}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {liveFeed.slice(0, 3).map((item) => (
                    <button
                      className="sidebar-mini"
                      key={item.id}
                      onClick={() => handleSelectLog(item.id)}
                      type="button"
                    >
                      <span className="method-pill">{item.method}</span>
                      <span className="truncate text-left text-sm inspector-soft">
                        {item.path}
                      </span>
                    </button>
                  ))}
                </div>
                {nextCursor ? (
                  <button
                    className="secondary-button mt-3 w-full"
                    onClick={() => void handleLoadMore()}
                    type="button"
                  >
                    Load more
                  </button>
                ) : null}
              </div>
            </aside>

            <section className="inspector-pane">
              <div className="inspector-head">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] inspector-muted">
                      Request details
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <span className="text-lg font-semibold inspector-strong">
                        {detail?.request.path ?? "Select a request"}
                      </span>
                      {detail ? (
                        <span className="method-pill">
                          {detail.request.method}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm inspector-muted">
                      {detail?.project.name ??
                        selectedProjectRecord?.name ??
                        "Choose a project"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm inspector-soft">
                    <span>{stats.totalRequests} total</span>
                    <span>{stats.errorCount} errors</span>
                    <span>{Math.round(stats.averageLatencyMs)} ms avg</span>
                  </div>
                </div>
              </div>

              <div className="min-h-[60vh] px-4 py-4 sm:px-5 sm:py-5">
                {detail ? (
                  <div className="space-y-5">
                    <section className="inspector-section">
                      <SectionLabel title="Request details & headers" />
                      <div className="inspector-two-col mt-3">
                        <div className="inspector-panel">
                          <KeyValueRows
                            items={[
                              {
                                label: "Method",
                                value: detail.request.method,
                              },
                              {
                                label: "Status",
                                value: detail.response.status
                                  ? `${detail.response.status}`
                                  : "Upstream error",
                              },
                              {
                                label: "Project",
                                value: detail.project.name,
                              },
                              {
                                label: "URL",
                                value: detail.request.url,
                                mono: true,
                              },
                              {
                                label: "Date",
                                value: formatDateTime(detail.createdAt),
                              },
                              {
                                label: "Time",
                                value: `${detail.durationMs} ms`,
                              },
                              {
                                label: "Client IP",
                                value: detail.clientIp || "-",
                              },
                              {
                                label: "User Agent",
                                value: detail.userAgent || "-",
                              },
                            ]}
                          />
                        </div>
                        <div className="inspector-panel">
                          <KeyValueRows
                            items={toKeyValueRows(detail.request.headers)}
                            emptyLabel="No request headers"
                            mono
                          />
                        </div>
                      </div>
                    </section>

                    <section className="inspector-section">
                      <div className="inspector-two-col">
                        <div className="inspector-panel">
                          <SectionLabel title="Query strings" />
                          <div className="mt-3">
                            <KeyValueRows
                              items={toKeyValueRows(detail.request.query)}
                              emptyLabel="None"
                              mono
                            />
                          </div>
                        </div>
                        <div className="inspector-panel">
                          <SectionLabel title="Response headers" />
                          <div className="mt-3">
                            <KeyValueRows
                              items={toKeyValueRows(detail.response.headers)}
                              emptyLabel="No response headers"
                              mono
                            />
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="inspector-section">
                      <InspectorBody
                        theme={theme}
                        title="Request content"
                        body={detail.request.body}
                      />
                    </section>

                    <section className="inspector-section">
                      <InspectorBody
                        theme={theme}
                        title="Response body"
                        body={detail.response.body}
                      />
                    </section>

                    {detail.error ? (
                      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                        {detail.error}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="inspector-empty">
                    Select a request from the left sidebar to inspect its
                    headers, query params, and body.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectForm({
  form,
  isCreating,
  onChange,
  onSubmit,
}: {
  form: CreateProjectInput;
  isCreating: boolean;
  onChange: (value: CreateProjectInput) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <section className="glass-panel p-6">
      <div className="badge">Create project</div>
      <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
        Add a target API
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        Each project gets a readable slug and its own proxy URL.
      </p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block space-y-2">
          <span className="label">Project name</span>
          <input
            className="field"
            onChange={(event) =>
              onChange({ ...form, name: event.target.value })
            }
            placeholder="Stripe Sandbox"
            value={form.name}
          />
        </label>
        <label className="block space-y-2">
          <span className="label">Project slug</span>
          <input
            className="field"
            onChange={(event) =>
              onChange({ ...form, slug: event.target.value })
            }
            placeholder="stripe-sandbox"
            value={form.slug}
          />
        </label>
        <label className="block space-y-2">
          <span className="label">Base URL</span>
          <input
            className="field"
            onChange={(event) =>
              onChange({ ...form, baseUrl: event.target.value })
            }
            placeholder="https://api.stripe.com"
            value={form.baseUrl}
          />
        </label>
        <button className="primary-button" disabled={isCreating} type="submit">
          {isCreating ? "Creating..." : "Create project"}
        </button>
      </form>
    </section>
  );
}

function ProjectList({
  projects,
  selectedProject,
  onSelectProject,
}: {
  projects: Project[];
  selectedProject: string;
  onSelectProject: (slug: string) => void;
}) {
  return (
    <section className="glass-panel p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="badge">Projects</div>
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
            Configured upstreams
          </h2>
        </div>
        <Link className="secondary-button" href="/dashboard">
          Open dashboard
        </Link>
      </div>
      <div className="mt-6 space-y-4">
        {projects.length ? (
          projects.map((project) => (
            <button
              className={`project-card ${selectedProject === project.slug ? "selected" : ""}`}
              key={project.id}
              onClick={() => onSelectProject(project.slug)}
              type="button"
            >
              <div>
                <div className="text-lg font-medium text-slate-950">
                  {project.name}
                </div>
                <div className="mt-1 font-mono text-sm text-slate-700">
                  /proxy/{project.slug}/*path
                </div>
              </div>
              <div className="text-right text-sm text-slate-400">
                <div>{project.baseUrl}</div>
                <div className="mt-1">
                  {project.isActive ? "Active" : "Inactive"}
                </div>
              </div>
            </button>
          ))
        ) : (
          <p className="text-sm text-slate-400">
            No projects configured yet. Create one to enable proxying.
          </p>
        )}
      </div>
    </section>
  );
}

function StatusBadge({
  status,
  hasError,
}: {
  status: number;
  hasError: boolean;
}) {
  const tone = hasError || status >= 400 ? "error" : "success";
  const label = status ? `${status}` : "ERR";
  return <span className={`status-badge ${tone}`}>{label}</span>;
}

function SectionLabel({ title }: { title: string }) {
  return (
    <div className="text-xs uppercase tracking-[0.18em] inspector-muted">
      {title}
    </div>
  );
}

function KeyValueRows({
  items,
  emptyLabel = "None",
  mono = false,
}: {
  items: Array<{ label: string; value: string; mono?: boolean }>;
  emptyLabel?: string;
  mono?: boolean;
}) {
  if (!items.length) {
    return <div className="inspector-empty-row">{emptyLabel}</div>;
  }

  return (
    <div className="space-y-px overflow-hidden rounded-lg border inspector-border">
      {items.map((item) => (
        <div className="inspector-kv-row" key={`${item.label}-${item.value}`}>
          <div className="inspector-kv-label">{item.label}</div>
          <div
            className={`inspector-kv-value ${
              mono || item.mono ? "font-mono" : ""
            }`}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function InspectorBody({
  title,
  body,
  theme,
}: {
  title: string;
  body: LogDetail["request"]["body"];
  theme: WorkspaceTheme;
}) {
  const preview = getBodyPreview(body);

  return (
    <section>
      <SectionLabel title={title} />
      <div className="inspector-panel mt-3">
        <div className="mb-3 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] inspector-muted">
          <span>{body.contentType || "unknown"}</span>
          <span>{body.size} bytes</span>
          {body.binary ? <span>Binary</span> : null}
          {body.truncated ? <span>Truncated</span> : null}
        </div>
        {preview.kind === "json" ? (
          <JsonPreview theme={theme} value={preview.value} />
        ) : (
          <pre className="inspector-code m-0">{preview.value}</pre>
        )}
      </div>
    </section>
  );
}

function toKeyValueRows(
  value?: Record<string, string[]> | null,
): Array<{ label: string; value: string }> {
  if (!value) {
    return [];
  }

  return Object.entries(value).map(([label, entry]) => ({
    label,
    value: Array.isArray(entry) ? entry.join(", ") : String(entry ?? ""),
  }));
}

function JsonPreview({
  value,
  theme,
}: {
  value: unknown;
  theme: WorkspaceTheme;
}) {
  const baseTheme = theme === "dark" ? jsonDarkTheme : jsonLightTheme;

  return (
    <div className="json-view-shell">
      <JsonView
        collapsed={false}
        displayDataTypes={false}
        displayObjectSize
        enableClipboard
        indentWidth={16}
        shortenTextAfterLength={0}
        style={{
          ...baseTheme,
          backgroundColor: "transparent",
          fontFamily: "var(--font-mono), monospace",
          fontSize: "0.8rem",
          lineHeight: 1.6,
          padding: "1rem",
        }}
        value={asJsonObject(value)}
      />
    </div>
  );
}

function getBodyPreview(
  body: LogDetail["request"]["body"],
): { kind: "text"; value: string } | { kind: "json"; value: unknown } {
  if (body.binary) {
    return {
      kind: "text",
      value: "Binary payload omitted from inline preview.",
    };
  }

  if (!body.preview) {
    return { kind: "text", value: "No body captured." };
  }

  const trimmed = body.preview.trim();
  if (!trimmed) {
    return { kind: "text", value: "No body captured." };
  }

  const contentType = body.contentType.toLowerCase();
  const looksLikeJson =
    contentType.includes("json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (!looksLikeJson) {
    return { kind: "text", value: body.preview };
  }

  try {
    return { kind: "json", value: JSON.parse(trimmed) };
  } catch {
    return { kind: "text", value: body.preview };
  }
}

function asJsonObject(value: unknown): object {
  if (value && typeof value === "object") {
    return value as object;
  }

  return { value };
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return date.toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTime(value: string) {
  const date = new Date(value);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong while talking to the API.";
}

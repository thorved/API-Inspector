"use client";

import JsonView from "@uiw/react-json-view";
import { darkTheme as jsonDarkTheme } from "@uiw/react-json-view/dark";
import { lightTheme as jsonLightTheme } from "@uiw/react-json-view/light";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  buildApiUrl,
  clearLogs,
  createProject,
  deleteLog,
  deleteProject,
  getLog,
  getStats,
  listLogs,
  listProjects,
  updateProject,
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
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isClearingLogs, setIsClearingLogs] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [_liveFeed, setLiveFeed] = useState<LogSummary[]>([]);
  const [view, setView] = useState<"overview" | "projects">(initialView);
  const [form, setForm] = useState<CreateProjectInput>({
    name: "",
    slug: "",
    baseUrl: "",
  });
  const [theme, setTheme] = useState<WorkspaceTheme>("light");
  const [editingProjectSlug, setEditingProjectSlug] = useState("");
  const [deletingProjectSlug, setDeletingProjectSlug] = useState("");
  const [deletingLogID, setDeletingLogID] = useState("");
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
      "api-inspector-workspace-theme",
    ) as WorkspaceTheme | null;
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("api-inspector-workspace-theme", theme);
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

  async function reloadProjects() {
    const payload = await listProjects();
    setProjects(payload.items);
    return payload.items;
  }

  async function reloadTraffic(projectSlug: string) {
    if (!projectSlug) {
      setLogs([]);
      setStats(emptyStats);
      setNextCursor("");
      setDetail(null);
      return;
    }

    const [logsPayload, statsPayload] = await Promise.all([
      listLogs({
        project: projectSlug,
        method: method === "ALL" ? "" : method,
        status,
        search: deferredSearch,
      }),
      getStats(projectSlug),
    ]);

    setLogs(logsPayload.items);
    setNextCursor(logsPayload.nextCursor ?? "");
    setStats(statsPayload);
  }

  async function handleSubmitProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingProject(true);

    try {
      const saved = editingProjectSlug
        ? await updateProject(editingProjectSlug, form)
        : await createProject(form);
      const projectsPayload = await reloadProjects();
      setForm({ name: "", slug: "", baseUrl: "" });
      setEditingProjectSlug("");
      setProjects(projectsPayload);
      setErrorMessage("");
      startTransition(() => {
        setView("overview");
        setSelectedProject(saved.slug);
        setSelectedLog("");
        updateQuery({ project: saved.slug, log: "" });
      });
    } catch (error) {
      setErrorMessage(toMessage(error));
    } finally {
      setIsSavingProject(false);
    }
  }

  function handleEditProject(project: Project) {
    setForm({
      name: project.name,
      slug: project.slug,
      baseUrl: project.baseUrl,
    });
    setEditingProjectSlug(project.slug);
    setView("projects");
    setErrorMessage("");
  }

  function handleCancelProjectEdit() {
    setForm({ name: "", slug: "", baseUrl: "" });
    setEditingProjectSlug("");
  }

  async function handleDeleteProject(slug: string) {
    if (!window.confirm("Delete this project and all of its captured logs?")) {
      return;
    }

    setDeletingProjectSlug(slug);
    try {
      await deleteProject(slug);
      const nextProjects = await reloadProjects();
      setLiveFeed((current) =>
        current.filter((item) => item.projectSlug !== slug),
      );

      if (editingProjectSlug === slug) {
        handleCancelProjectEdit();
      }

      if (selectedProject === slug) {
        const nextProject = nextProjects[0]?.slug ?? "";
        setSelectedProject(nextProject);
        setSelectedLog("");
        setDetail(null);
        updateQuery({ project: nextProject, log: "" });
        if (nextProject) {
          await reloadTraffic(nextProject);
        } else {
          setLogs([]);
          setStats(emptyStats);
          setNextCursor("");
        }
      }

      setErrorMessage("");
    } catch (error) {
      setErrorMessage(toMessage(error));
    } finally {
      setDeletingProjectSlug("");
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

  async function handleDeleteLog(logId: string) {
    if (!window.confirm("Remove this captured request?")) {
      return;
    }

    setDeletingLogID(logId);
    try {
      await deleteLog(logId);
      setLiveFeed((current) => current.filter((item) => item.id !== logId));
      if (selectedLog === logId) {
        setSelectedLog("");
        setDetail(null);
        updateQuery({ project: selectedProject, log: "" });
      }
      await reloadTraffic(selectedProject);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(toMessage(error));
    } finally {
      setDeletingLogID("");
    }
  }

  async function handleClearCapturedRequests() {
    if (!window.confirm("Clear all captured requests for this project?")) {
      return;
    }

    setIsClearingLogs(true);
    try {
      await clearLogs(selectedProject);
      setSelectedLog("");
      setDetail(null);
      setLiveFeed((current) =>
        current.filter((item) => item.projectSlug !== selectedProject),
      );
      updateQuery({ project: selectedProject, log: "" });
      await reloadTraffic(selectedProject);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(toMessage(error));
    } finally {
      setIsClearingLogs(false);
    }
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
        view === "overview"
          ? `inspector-page theme-${theme} h-screen overflow-hidden`
          : "clean-page"
      }
    >
      <div
        className={`mx-auto flex w-full max-w-none flex-col gap-6 px-4 py-4 sm:px-5 lg:px-6 ${
          view === "overview" ? "h-screen overflow-hidden" : "min-h-screen"
        }`}
      >
        <nav className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="badge">API-Inspector</div>
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
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
              editingProjectSlug={editingProjectSlug}
              form={form}
              isSavingProject={isSavingProject}
              onCancelEdit={handleCancelProjectEdit}
              onChange={setForm}
              onSubmit={handleSubmitProject}
            />
            <ProjectList
              deletingProjectSlug={deletingProjectSlug}
              onDeleteProject={handleDeleteProject}
              onEditProject={handleEditProject}
              onOpenDashboard={() => setView("overview")}
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
                  <div className="flex items-center gap-2">
                    {logs.length ? (
                      <button
                        className="inspector-icon-button"
                        disabled={isClearingLogs}
                        onClick={() => void handleClearCapturedRequests()}
                        type="button"
                      >
                        {isClearingLogs ? "..." : "Clear"}
                      </button>
                    ) : null}
                    {isLoading ? <span className="pulse-dot" /> : null}
                  </div>
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

              <div className="inspector-sidebar-list">
                {logs.length ? (
                  logs.map((log) => (
                    <div
                      className={`sidebar-request ${
                        selectedLog === log.id ? "active" : ""
                      }`}
                      key={log.id}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          className="min-w-0 flex-1 text-left"
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
                        <button
                          className="inspector-icon-button mt-0.5"
                          disabled={deletingLogID === log.id}
                          onClick={() => void handleDeleteLog(log.id)}
                          type="button"
                        >
                          {deletingLogID === log.id ? "..." : "×"}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-6 text-sm inspector-muted">
                    No traffic yet. Proxy a request through the selected project
                    to populate this inbox.
                  </div>
                )}
              </div>

              <div className="inspector-sidebar-bottom">
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
                    {detail ? (
                      <button
                        className="inspector-icon-button"
                        disabled={deletingLogID === detail.id}
                        onClick={() => void handleDeleteLog(detail.id)}
                        type="button"
                      >
                        {deletingLogID === detail.id
                          ? "Removing..."
                          : "Remove request"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="inspector-pane-body px-4 py-4 sm:px-5 sm:py-5">
                {detail ? (
                  <div className="space-y-4">
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
                            compact
                          />
                        </div>
                        <div className="inspector-panel">
                          <KeyValueRows
                            compact
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
                              compact
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
                              compact
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
  editingProjectSlug,
  form,
  isSavingProject,
  onCancelEdit,
  onChange,
  onSubmit,
}: {
  editingProjectSlug: string;
  form: CreateProjectInput;
  isSavingProject: boolean;
  onCancelEdit: () => void;
  onChange: (value: CreateProjectInput) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const isEditing = editingProjectSlug !== "";

  return (
    <section className="glass-panel p-6">
      <div className="badge">
        {isEditing ? "Edit project" : "Create project"}
      </div>
      <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
        {isEditing ? "Update target API" : "Add a target API"}
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
        <div className="flex flex-wrap gap-3">
          <button
            className="primary-button"
            disabled={isSavingProject}
            type="submit"
          >
            {isSavingProject
              ? isEditing
                ? "Saving..."
                : "Creating..."
              : isEditing
                ? "Save changes"
                : "Create project"}
          </button>
          {isEditing ? (
            <button
              className="secondary-button"
              onClick={onCancelEdit}
              type="button"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function ProjectList({
  deletingProjectSlug,
  onDeleteProject,
  onEditProject,
  onOpenDashboard,
  projects,
  selectedProject,
  onSelectProject,
}: {
  deletingProjectSlug: string;
  onDeleteProject: (slug: string) => Promise<void>;
  onEditProject: (project: Project) => void;
  onOpenDashboard: () => void;
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
        <button
          className="secondary-button"
          onClick={onOpenDashboard}
          type="button"
        >
          Open dashboard
        </button>
      </div>
      <div className="mt-6 space-y-4">
        {projects.length ? (
          projects.map((project) => (
            <div
              className={`project-card ${selectedProject === project.slug ? "selected" : ""}`}
              key={project.id}
            >
              <button
                className="w-full text-left"
                onClick={() => onSelectProject(project.slug)}
                type="button"
              >
                <div className="flex items-start justify-between gap-4">
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
                </div>
              </button>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="secondary-button"
                  onClick={() => onEditProject(project)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="danger-button"
                  disabled={deletingProjectSlug === project.slug}
                  onClick={() => void onDeleteProject(project.slug)}
                  type="button"
                >
                  {deletingProjectSlug === project.slug
                    ? "Deleting..."
                    : "Delete"}
                </button>
              </div>
            </div>
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
  compact = false,
}: {
  items: Array<{ label: string; value: string; mono?: boolean }>;
  emptyLabel?: string;
  mono?: boolean;
  compact?: boolean;
}) {
  const [expandedItem, setExpandedItem] = useState<{
    label: string;
    value: string;
    mono: boolean;
  } | null>(null);

  if (!items.length) {
    return <div className="inspector-empty-row">{emptyLabel}</div>;
  }

  return (
    <>
      <div className="space-y-px overflow-hidden rounded-lg border inspector-border">
        {items.map((item) => {
          const shouldExpand =
            item.value.length > 120 || item.value.includes("\n");
          const rowMono = mono || item.mono === true;

          return (
            <div
              className={`inspector-kv-row ${compact ? "compact" : ""}`}
              key={`${item.label}-${item.value}`}
            >
              <div className="inspector-kv-label">{item.label}</div>
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className={`inspector-kv-value ${
                    rowMono ? "font-mono" : ""
                  } ${compact ? "truncate" : ""}`}
                  title={compact ? item.value : undefined}
                >
                  {item.value}
                </div>
                {shouldExpand ? (
                  <button
                    className="inspector-expand-button"
                    onClick={() =>
                      setExpandedItem({
                        label: item.label,
                        value: item.value,
                        mono: rowMono,
                      })
                    }
                    type="button"
                  >
                    Expand
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {expandedItem ? (
        <div className="inspector-modal-backdrop">
          <button
            aria-label="Close expanded value"
            className="inspector-modal-dismiss"
            onClick={() => setExpandedItem(null)}
            type="button"
          />
          <div
            className="inspector-modal"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setExpandedItem(null);
              }
            }}
            role="dialog"
            tabIndex={-1}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] inspector-muted">
                  {expandedItem.label}
                </div>
                <div className="mt-1 text-sm font-semibold inspector-strong">
                  Full value
                </div>
              </div>
              <button
                className="inspector-icon-button"
                onClick={() => setExpandedItem(null)}
                type="button"
              >
                Close
              </button>
            </div>
            <pre
              className={`inspector-code mt-4 max-h-[60vh] ${
                expandedItem.mono ? "font-mono" : ""
              }`}
            >
              {expandedItem.value}
            </pre>
          </div>
        </div>
      ) : null}
    </>
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

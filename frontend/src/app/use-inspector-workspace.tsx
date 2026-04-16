"use client";

import {
  type FormEvent,
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
  getWatchState,
  listLogs,
  listProjects,
  resolveWatchRequest,
  updateProject,
  updateWatchState,
} from "@/lib/api";
import type {
  CreateProjectInput,
  LogDetail,
  LogSummary,
  PendingWatchRequest,
  Project,
  StatsResponse,
  TrafficEvent,
  WatchEvent,
} from "@/types/api";

export type WorkspaceTheme = "light" | "dark";

export const methodOptions = ["ALL", "GET", "POST", "PUT", "PATCH", "DELETE"];

export const statusOptions = [
  { label: "All", value: "" },
  { label: "Success", value: "success" },
  { label: "Error", value: "error" },
];

export const emptyStats: StatsResponse = {
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
  const nextUrl = nextSearch
    ? `${window.location.pathname}?${nextSearch}`
    : window.location.pathname;

  window.history.replaceState(null, "", nextUrl);
}

type UseInspectorWorkspaceOptions = {
  includeTraffic?: boolean;
};

export function useInspectorWorkspace({
  includeTraffic = false,
}: UseInspectorWorkspaceOptions = {}) {
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
  const [isLoading, setIsLoading] = useState(includeTraffic);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isClearingLogs, setIsClearingLogs] = useState(false);
  const [isSavingWatchState, setIsSavingWatchState] = useState(false);
  const [isResolvingWatchRequest, setIsResolvingWatchRequest] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [projectFormErrorMessage, setProjectFormErrorMessage] = useState("");
  const [_liveFeed, setLiveFeed] = useState<LogSummary[]>([]);
  const [watchEnabled, setWatchEnabled] = useState(false);
  const [watchTimeoutSeconds, setWatchTimeoutSeconds] = useState(30);
  const [pendingWatchRequests, setPendingWatchRequests] = useState<
    PendingWatchRequest[]
  >([]);
  const [form, setForm] = useState<CreateProjectInput>({
    name: "",
    slug: "",
    baseUrl: "",
  });
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
    if (!includeTraffic) {
      setIsLoading(false);
      setWatchEnabled(false);
      setPendingWatchRequests([]);
      return;
    }

    if (!selectedProject) {
      setLogs([]);
      setStats(emptyStats);
      setWatchEnabled(false);
      setPendingWatchRequests([]);
      setIsLoading(false);
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
  }, [deferredSearch, includeTraffic, method, selectedProject, status]);

  useEffect(() => {
    if (!includeTraffic) {
      return;
    }

    if (!selectedProject) {
      setWatchEnabled(false);
      setPendingWatchRequests([]);
      setWatchTimeoutSeconds(30);
      return;
    }

    let cancelled = false;

    async function loadWatchState() {
      try {
        const payload = await getWatchState(selectedProject);
        if (cancelled) {
          return;
        }

        setWatchEnabled(payload.enabled);
        setWatchTimeoutSeconds(payload.timeoutSeconds);
        setPendingWatchRequests(payload.pending);
        setErrorMessage("");
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(toMessage(error));
        }
      }
    }

    void loadWatchState();

    return () => {
      cancelled = true;
    };
  }, [includeTraffic, selectedProject]);

  useEffect(() => {
    if (!includeTraffic) {
      return;
    }

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
  }, [includeTraffic, selectedLog]);

  useEffect(() => {
    if (!includeTraffic) {
      return;
    }

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

    const handleWatchEvent = (event: MessageEvent) => {
      const payload = JSON.parse(event.data) as WatchEvent;

      if (
        payload.type === "watch.requested" &&
        payload.request.projectSlug !== selectedProject
      ) {
        return;
      }

      if (
        payload.type === "watch.resolved" &&
        payload.projectSlug !== selectedProject
      ) {
        return;
      }

      if (
        payload.type === "watch.state.changed" &&
        payload.state.projectSlug !== selectedProject
      ) {
        return;
      }

      if (!selectedProject) {
        return;
      }

      void getWatchState(selectedProject)
        .then((watchState) => {
          setWatchEnabled(watchState.enabled);
          setWatchTimeoutSeconds(watchState.timeoutSeconds);
          setPendingWatchRequests(watchState.pending);
          setErrorMessage("");
        })
        .catch((error) => {
          setErrorMessage(toMessage(error));
        });
    };

    source.addEventListener("traffic.created", handleTraffic);
    source.addEventListener("watch.requested", handleWatchEvent);
    source.addEventListener("watch.resolved", handleWatchEvent);
    source.addEventListener("watch.state.changed", handleWatchEvent);
    source.onerror = () => {
      source.close();
    };

    return () => {
      source.removeEventListener("traffic.created", handleTraffic);
      source.removeEventListener("watch.requested", handleWatchEvent);
      source.removeEventListener("watch.resolved", handleWatchEvent);
      source.removeEventListener("watch.state.changed", handleWatchEvent);
      source.close();
    };
  }, [deferredSearch, includeTraffic, method, selectedProject, status]);

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

  async function reloadWatch(projectSlug: string) {
    if (!projectSlug) {
      setWatchEnabled(false);
      setPendingWatchRequests([]);
      setWatchTimeoutSeconds(30);
      return;
    }

    const payload = await getWatchState(projectSlug);
    setWatchEnabled(payload.enabled);
    setWatchTimeoutSeconds(payload.timeoutSeconds);
    setPendingWatchRequests(payload.pending);
  }

  async function handleSubmitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingProject(true);
    setProjectFormErrorMessage("");

    try {
      const saved = editingProjectSlug
        ? await updateProject(editingProjectSlug, form)
        : await createProject(form);
      const projectsPayload = await reloadProjects();

      setForm({ name: "", slug: "", baseUrl: "" });
      setEditingProjectSlug("");
      setProjects(projectsPayload);
      setSelectedProject(saved.slug);
      setSelectedLog("");
      updateQuery({ project: saved.slug, log: "" });
      setErrorMessage("");
      setProjectFormErrorMessage("");
      return true;
    } catch (error) {
      setProjectFormErrorMessage(toMessage(error));
      return false;
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
    setProjectFormErrorMessage("");
  }

  function handleCancelProjectEdit() {
    setForm({ name: "", slug: "", baseUrl: "" });
    setEditingProjectSlug("");
    setProjectFormErrorMessage("");
  }

  function handleProjectFormChange(value: CreateProjectInput) {
    setForm(value);
    setProjectFormErrorMessage("");
  }

  async function handleDeleteProject(slug: string) {
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

        if (includeTraffic && nextProject) {
          await reloadTraffic(nextProject);
        } else if (includeTraffic) {
          setLogs([]);
          setStats(emptyStats);
          setNextCursor("");
        }
      }

      setErrorMessage("");
      return true;
    } catch (error) {
      setErrorMessage(toMessage(error));
      return false;
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

  async function handleWatchToggle(enabled: boolean) {
    if (!selectedProject) {
      return;
    }

    setIsSavingWatchState(true);

    try {
      const payload = await updateWatchState(selectedProject, enabled);
      setWatchEnabled(payload.enabled);
      setWatchTimeoutSeconds(payload.timeoutSeconds);
      setPendingWatchRequests(payload.pending);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(toMessage(error));
    } finally {
      setIsSavingWatchState(false);
    }
  }

  async function handleResolveWatchRequest(
    id: string,
    action: "approve" | "deny",
  ) {
    setIsResolvingWatchRequest(id);

    try {
      await resolveWatchRequest(id, action);
      await reloadWatch(selectedProject);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(toMessage(error));
    } finally {
      setIsResolvingWatchRequest("");
    }
  }

  return {
    deferredSearch,
    deletingLogID,
    deletingProjectSlug,
    detail,
    editingProjectSlug,
    errorMessage,
    form,
    handleCancelProjectEdit,
    handleClearCapturedRequests,
    handleDeleteLog,
    handleDeleteProject,
    handleEditProject,
    handleProjectFormChange,
    handleLoadMore,
    handleProjectChange,
    handleResolveWatchRequest,
    handleSelectLog,
    handleSubmitProject,
    handleWatchToggle,
    isClearingLogs,
    isLoading,
    isResolvingWatchRequest,
    isSavingWatchState,
    isSavingProject,
    logs,
    method,
    nextCursor,
    pendingWatchRequests,
    projectFormErrorMessage,
    projects,
    search,
    selectedLog,
    selectedProject,
    selectedProjectRecord,
    setForm: handleProjectFormChange,
    setMethod,
    setSearch,
    setStatus,
    stats,
    status,
    watchEnabled,
    watchTimeoutSeconds,
  };
}

function toMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while talking to the API.";
}

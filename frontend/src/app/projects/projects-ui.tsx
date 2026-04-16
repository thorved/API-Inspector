"use client";
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import type { CreateProjectInput, Project, StatsResponse } from "@/types/api";
import {
  formatDateTime,
  formatTime,
  StatusBadge,
} from "../dashboard/dashboard-ui";
import type { WorkspaceTheme } from "../use-inspector-workspace";
import styles from "./projects.module.css";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type ProjectsFrameProps = {
  children: ReactNode;
  errorMessage?: string;
  theme: WorkspaceTheme;
};

export function ProjectsFrame({
  children,
  errorMessage,
  theme,
}: ProjectsFrameProps) {
  return (
    <div
      className={cx(
        styles.page,
        styles.cleanPage,
        "h-full min-h-0 overflow-hidden",
      )}
      data-theme={theme}
    >
      <div className="mx-auto flex min-h-0 flex-1 w-full max-w-none flex-col gap-6 overflow-hidden px-4 py-4 sm:px-5 lg:px-6">
        {errorMessage ? (
          <section className={styles.workspaceAlert}>{errorMessage}</section>
        ) : null}

        {children}
      </div>
    </div>
  );
}

export function ProjectFormModal({
  editingProjectSlug,
  errorMessage,
  form,
  isOpen,
  isSavingProject,
  onCancelEdit,
  onChange,
  onSubmit,
}: {
  editingProjectSlug: string;
  errorMessage?: string;
  form: CreateProjectInput;
  isOpen: boolean;
  isSavingProject: boolean;
  onCancelEdit: () => void;
  onChange: (value: CreateProjectInput) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
}) {
  const isEditing = editingProjectSlug !== "";
  const titleId = isEditing
    ? "edit-project-modal-title"
    : "create-project-modal-title";
  const nameFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    nameFieldRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancelEdit();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onCancelEdit]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.modalBackdrop}>
      <button
        aria-label="Close project form"
        className={styles.modalDismiss}
        onClick={onCancelEdit}
        type="button"
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.projectModal}
        role="dialog"
      >
        <div className={styles.badge}>
          {isEditing ? "Edit project" : "Create project"}
        </div>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h2 className={styles.workspaceTitle} id={titleId}>
              {isEditing ? "Update target API" : "Add a target API"}
            </h2>
            <p className={cx(styles.workspaceMuted, "mt-2 text-sm")}>
              Give each upstream a readable slug and a clean proxy URL you can
              share across your tools.
            </p>
          </div>
          <button
            className={styles.secondaryButton}
            onClick={onCancelEdit}
            type="button"
          >
            Close
          </button>
        </div>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          {errorMessage ? (
            <section className={styles.workspaceAlert}>{errorMessage}</section>
          ) : null}
          <label className="block space-y-2">
            <span className={styles.label}>Project name</span>
            <input
              className={styles.field}
              ref={nameFieldRef}
              onChange={(event) =>
                onChange({ ...form, name: event.target.value })
              }
              placeholder="Stripe Sandbox"
              value={form.name}
            />
          </label>
          <label className="block space-y-2">
            <span className={styles.label}>Project slug</span>
            <input
              className={styles.field}
              onChange={(event) =>
                onChange({ ...form, slug: event.target.value })
              }
              placeholder="stripe-sandbox"
              value={form.slug}
            />
          </label>
          <label className="block space-y-2">
            <span className={styles.label}>Base URL</span>
            <input
              className={styles.field}
              onChange={(event) =>
                onChange({ ...form, baseUrl: event.target.value })
              }
              placeholder="https://api.stripe.com"
              value={form.baseUrl}
            />
          </label>
          <div className={styles.modalActions}>
            <button
              className={styles.secondaryButton}
              onClick={onCancelEdit}
              type="button"
            >
              Cancel
            </button>
            <button
              className={styles.primaryButton}
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
          </div>
        </form>
      </div>
    </div>
  );
}

export function ProjectSidebar({
  deletingProjectSlug,
  isLoading,
  onDeleteProject,
  onEditProject,
  onSelectProject,
  projects,
  selectedProject,
}: {
  deletingProjectSlug: string;
  isLoading: boolean;
  onDeleteProject: (project: Project) => void;
  onEditProject: (project: Project) => void;
  onSelectProject: (slug: string) => void;
  projects: Project[];
  selectedProject: string;
}) {
  function handleRowKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    slug: string,
  ) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onSelectProject(slug);
  }

  return (
    <aside className={styles.projectsSidebar}>
      <div className={styles.projectsSidebarTop}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className={styles.projectsSidebarLabel}>Projects</div>
            <div className={styles.projectsSidebarCount}>
              {projects.length} total
            </div>
          </div>
          {isLoading ? <span className={styles.sidebarPulseDot} /> : null}
        </div>
      </div>

      <div className={styles.projectsSidebarList}>
        {projects.length ? (
          projects.map((project) => {
            const isSelected = selectedProject === project.slug;

            return (
              <div
                className={cx(
                  styles.sidebarProjectCard,
                  isSelected && styles.sidebarProjectCardActive,
                )}
                key={project.id}
              >
                <div className={styles.sidebarProjectTopRow}>
                  <button
                    className={styles.sidebarProjectButton}
                    onClick={() => onSelectProject(project.slug)}
                    onKeyDown={(event) => handleRowKeyDown(event, project.slug)}
                    type="button"
                  >
                    <div className={styles.sidebarProjectHeadline}>
                      <span className={styles.workspaceCardTitle}>
                        {project.name}
                      </span>
                      <span
                        className={cx(
                          styles.statusPill,
                          project.isActive
                            ? styles.statusPillActive
                            : styles.statusPillInactive,
                        )}
                      >
                        {project.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className={styles.sidebarProjectSlug}>
                      /proxy/{project.slug}
                    </div>
                    <div className={styles.sidebarProjectUrl}>
                      {project.baseUrl}
                    </div>
                  </button>
                  <div className={styles.sidebarProjectActions}>
                    <button
                      aria-label={`Edit ${project.name}`}
                      className={styles.iconButton}
                      onClick={() => onEditProject(project)}
                      title="Edit project"
                      type="button"
                    >
                      <EditIcon />
                    </button>
                    <button
                      aria-label={`Delete ${project.name}`}
                      className={styles.dangerIconButton}
                      disabled={deletingProjectSlug === project.slug}
                      onClick={() => onDeleteProject(project)}
                      title="Delete project"
                      type="button"
                    >
                      {deletingProjectSlug === project.slug ? (
                        "..."
                      ) : (
                        <DeleteIcon />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className={cx(styles.workspaceMuted, styles.sidebarEmptyState)}>
            No projects configured yet. Add one to start proxying requests.
          </div>
        )}
      </div>
    </aside>
  );
}

export function ProjectDeleteModal({
  deletingProjectSlug,
  isOpen,
  onCancel,
  onConfirm,
  project,
}: {
  deletingProjectSlug: string;
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<boolean>;
  project: Project | null;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const isDeleting = project ? deletingProjectSlug === project.slug : false;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    cancelButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDeleting) {
        onCancel();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDeleting, isOpen, onCancel]);

  if (!isOpen || !project) {
    return null;
  }

  return (
    <div className={styles.modalBackdrop}>
      <button
        aria-label="Close delete confirmation"
        className={styles.modalDismiss}
        disabled={isDeleting}
        onClick={onCancel}
        type="button"
      />
      <div
        aria-labelledby="delete-project-modal-title"
        aria-modal="true"
        className={styles.projectModal}
        role="dialog"
      >
        <div className={styles.badge}>Delete project</div>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h2
              className={styles.workspaceTitle}
              id="delete-project-modal-title"
            >
              Delete {project.name}?
            </h2>
            <p className={cx(styles.workspaceMuted, "mt-2 text-sm")}>
              This removes the project and all of its captured logs. This action
              cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-6 space-y-4">
          <section className={styles.workspaceAlert}>
            <div className={styles.modalWarningTitle}>Project</div>
            <div className={styles.modalWarningValue}>{project.name}</div>
            <div className={styles.modalWarningMeta}>/proxy/{project.slug}</div>
          </section>
          <div className={styles.modalActions}>
            <button
              className={styles.secondaryButton}
              disabled={isDeleting}
              onClick={onCancel}
              ref={cancelButtonRef}
              type="button"
            >
              Cancel
            </button>
            <button
              className={styles.dangerButton}
              disabled={isDeleting}
              onClick={() => void onConfirm()}
              type="button"
            >
              {isDeleting ? "Deleting..." : "Delete project"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectDetailsPane({
  onEditProject,
  project,
  stats,
}: {
  onEditProject: (project: Project) => void;
  project: Project | null;
  stats: StatsResponse;
}) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!project) {
    return (
      <section className={styles.projectPane}>
        <div className={styles.projectPaneEmpty}>
          Select a project from the left to review its base URL, proxy route,
          and request stats.
        </div>
      </section>
    );
  }

  const proxyUrl = `${origin || ""}/proxy/${project.slug}`;

  return (
    <section className={styles.projectPane}>
      <div className={styles.projectPaneHead}>
        <div>
          <div className={styles.projectsSidebarLabel}>Selected project</div>
          <div className={styles.projectPaneTitleRow}>
            <h2 className={styles.projectPaneTitle}>{project.name}</h2>
            <span
              className={cx(
                styles.statusPill,
                project.isActive
                  ? styles.statusPillActive
                  : styles.statusPillInactive,
              )}
            >
              {project.isActive ? "Active" : "Inactive"}
            </span>
          </div>
          <div className={styles.projectPaneSlug}>Slug: {project.slug}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={styles.secondaryButton}
            onClick={() => onEditProject(project)}
            type="button"
          >
            Edit Project
          </button>
        </div>
      </div>

      <div className={styles.projectPaneBody}>
        <div className={styles.projectStatsGrid}>
          <MetricCard label="Total requests" value={`${stats.totalRequests}`} />
          <MetricCard label="Success" value={`${stats.successCount}`} />
          <MetricCard label="Errors" value={`${stats.errorCount}`} />
          <MetricCard
            label="Avg latency"
            value={`${Math.round(stats.averageLatencyMs)} ms`}
          />
        </div>

        <div className={styles.projectDetailGrid}>
          <section className={styles.projectInfoCard}>
            <div className={styles.projectsSidebarLabel}>Project details</div>
            <div className="mt-4 space-y-3">
              <InfoRow label="Base URL" value={project.baseUrl} />
              <InfoRow
                copyValue={proxyUrl}
                label="Proxy URL"
                value={proxyUrl}
              />
              <InfoRow
                label="Created"
                value={formatDateTime(project.createdAt)}
              />
              <InfoRow
                label="Updated"
                value={formatDateTime(project.updatedAt)}
              />
            </div>
          </section>

          <section className={styles.projectInfoCard}>
            <div className={styles.projectsSidebarLabel}>Recent failures</div>
            <div className="mt-4 space-y-3">
              {stats.recentFailures.length ? (
                stats.recentFailures.slice(0, 4).map((failure) => (
                  <div className={styles.projectActivityRow} key={failure.id}>
                    <div className="min-w-0 flex-1">
                      <div className={styles.projectActivityHeadline}>
                        <span className={styles.projectActivityMethod}>
                          {failure.method}
                        </span>
                        <span className={styles.projectActivityPath}>
                          {failure.path}
                        </span>
                      </div>
                      <div className={styles.projectActivityMeta}>
                        {formatTime(failure.createdAt)}
                      </div>
                    </div>
                    <StatusBadge
                      hasError={failure.hasError}
                      status={failure.responseStatus}
                    />
                  </div>
                ))
              ) : (
                <div className={styles.projectActivityEmpty}>
                  No recent failures for this project.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.projectsSidebarLabel}>{label}</div>
      <div className={styles.metricValue}>{value}</div>
    </div>
  );
}

function InfoRow({
  copyValue,
  label,
  value,
}: {
  copyValue?: string;
  label: string;
  value: string;
}) {
  return (
    <div className={styles.infoRow}>
      <div className={styles.infoLabel}>{label}</div>
      {copyValue ? (
        <CopyField value={copyValue} />
      ) : (
        <div className={styles.infoValue}>{value}</div>
      )}
    </div>
  );
}

function CopyField({ value, mono = true }: { value: string; mono?: boolean }) {
  return (
    <div className={styles.copyField}>
      <div className={cx(styles.copyFieldValue, mono && "font-mono")}>
        {value}
      </div>
      <CopyButton value={value} />
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 1800);
    }
  }

  return (
    <button
      aria-label="Copy value"
      className={styles.iconButton}
      onClick={(event) => {
        event.stopPropagation();
        void handleCopy();
      }}
      title={
        copyState === "copied"
          ? "Copied"
          : copyState === "error"
            ? "Copy failed"
            : "Copy"
      }
      type="button"
    >
      {copyState === "copied" ? (
        <CheckIcon />
      ) : copyState === "error" ? (
        "!"
      ) : (
        <CopyIcon />
      )}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <rect
        height="8"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
        width="8"
        x="5"
        y="5"
      />
      <path
        d="M3.5 10.5h-1A1.5 1.5 0 0 1 1 9V3.5A1.5 1.5 0 0 1 2.5 2H8A1.5 1.5 0 0 1 9.5 3.5v1"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="m3.5 8.25 2.75 2.75 6.25-6.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M10.833 2.5a1.65 1.65 0 1 1 2.334 2.333l-7.25 7.25L3 12.75l.667-2.917 7.166-7.333Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M2.667 4h10.666M6.333 2h3.334M5.333 6.333v4m5.334-4v4M4.667 14h6.666A1.333 1.333 0 0 0 12.667 12V4H3.333v8A1.333 1.333 0 0 0 4.667 14Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}

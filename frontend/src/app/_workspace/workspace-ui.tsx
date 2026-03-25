"use client";

import JsonView from "@uiw/react-json-view";
import { darkTheme as jsonDarkTheme } from "@uiw/react-json-view/dark";
import { lightTheme as jsonLightTheme } from "@uiw/react-json-view/light";
import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import { buildApiUrl } from "@/lib/api";
import type {
  CreateProjectInput,
  LogDetail,
  Project,
  UploadedFile,
} from "@/types/api";
import styles from "./workspace.module.css";
import type { WorkspaceTheme } from "./workspace-state";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type WorkspaceFrameProps = {
  children: ReactNode;
  currentPage: "dashboard" | "projects";
  errorMessage?: string;
  theme: WorkspaceTheme;
  setTheme: (theme: WorkspaceTheme) => void;
};

export function WorkspaceFrame({
  children,
  currentPage,
  errorMessage,
  theme,
  setTheme,
}: WorkspaceFrameProps) {
  const isDashboard = currentPage === "dashboard";

  return (
    <div
      className={cx(
        styles.page,
        isDashboard ? styles.inspectorPage : styles.cleanPage,
        isDashboard ? "h-screen overflow-hidden" : "min-h-screen",
      )}
      data-theme={theme}
    >
      <div
        className={cx(
          "mx-auto flex w-full flex-col gap-6 px-4 py-4 sm:px-5 lg:px-6",
          isDashboard
            ? "h-screen max-w-none overflow-hidden"
            : "min-h-screen max-w-7xl",
        )}
      >
        <nav className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className={styles.badge}>API-Inspector</div>
            <Link
              className={cx(
                styles.tabButton,
                currentPage === "dashboard" && styles.tabButtonActive,
              )}
              href="/dashboard"
            >
              Traffic workspace
            </Link>
            <Link
              className={cx(
                styles.tabButton,
                currentPage === "projects" && styles.tabButtonActive,
              )}
              href="/projects"
            >
              Projects
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={cx(
                styles.tabButton,
                theme === "light" && styles.tabButtonActive,
              )}
              onClick={() => setTheme("light")}
              type="button"
            >
              Light
            </button>
            <button
              className={cx(
                styles.tabButton,
                theme === "dark" && styles.tabButtonActive,
              )}
              onClick={() => setTheme("dark")}
              type="button"
            >
              Dark
            </button>
          </div>
        </nav>

        {errorMessage ? (
          <section className={styles.workspaceAlert}>{errorMessage}</section>
        ) : null}

        {children}
      </div>
    </div>
  );
}

export function ProjectForm({
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
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const isEditing = editingProjectSlug !== "";

  return (
    <section className={cx(styles.glassPanel, "p-6")}>
      <div className={styles.badge}>
        {isEditing ? "Edit project" : "Create project"}
      </div>
      <h2 className={cx(styles.workspaceTitle, "mt-4")}>
        {isEditing ? "Update target API" : "Add a target API"}
      </h2>
      <p className={cx(styles.workspaceMuted, "mt-2 text-sm")}>
        Give each upstream a readable slug and a clean proxy URL you can share
        across your tools.
      </p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block space-y-2">
          <span className={styles.label}>Project name</span>
          <input
            className={styles.field}
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
        <div className="flex flex-wrap gap-3">
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
          {isEditing ? (
            <button
              className={styles.secondaryButton}
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

export function ProjectList({
  deletingProjectSlug,
  onDeleteProject,
  onEditProject,
  onSelectProject,
  projects,
  selectedProject,
}: {
  deletingProjectSlug: string;
  onDeleteProject: (slug: string) => Promise<void>;
  onEditProject: (project: Project) => void;
  onSelectProject: (slug: string) => void;
  projects: Project[];
  selectedProject: string;
}) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  return (
    <section className={cx(styles.glassPanel, "p-6")}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className={styles.badge}>Projects</div>
          <h2 className={cx(styles.workspaceTitle, "mt-4")}>
            Configured upstreams
          </h2>
        </div>
        <Link className={styles.secondaryButton} href="/dashboard">
          Open dashboard
        </Link>
      </div>
      <div className="mt-6 space-y-4">
        {projects.length ? (
          projects.map((project) => (
            <div
              className={cx(
                styles.projectCard,
                selectedProject === project.slug && styles.projectCardSelected,
              )}
              key={project.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <button
                    className="w-full text-left"
                    onClick={() => onSelectProject(project.slug)}
                    type="button"
                  >
                    <div className={styles.workspaceCardTitle}>
                      {project.name}
                    </div>
                  </button>
                  <div className={cx(styles.workspaceCaption, "mt-3")}>
                    Proxy URL
                  </div>
                  <div className="mt-1">
                    <CopyField
                      isOnInspectorPage={false}
                      value={`${origin || ""}/proxy/${project.slug}`}
                    />
                  </div>
                  <div className={cx(styles.workspaceCaption, "mt-3")}>
                    Full URL
                  </div>
                  <div className="mt-1">
                    <CopyField
                      isOnInspectorPage={false}
                      mono={false}
                      value={project.baseUrl}
                    />
                  </div>
                </div>
                <div
                  className={cx(styles.workspaceMuted, "text-right text-sm")}
                >
                  {project.isActive ? "Active" : "Inactive"}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className={styles.secondaryButton}
                  onClick={() => onEditProject(project)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className={styles.dangerButton}
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
          <p className={cx(styles.workspaceMuted, "text-sm")}>
            No projects configured yet. Create one to enable proxying.
          </p>
        )}
      </div>
    </section>
  );
}

export function CopyField({
  value,
  mono = true,
  isOnInspectorPage = true,
}: {
  value: string;
  mono?: boolean;
  isOnInspectorPage?: boolean;
}) {
  return (
    <div
      className={cx(
        styles.copyField,
        isOnInspectorPage ? styles.copyFieldInspector : styles.copyFieldClean,
      )}
    >
      <div className={cx(styles.copyFieldValue, mono && "font-mono")}>
        {value}
      </div>
      <CopyButton
        value={value}
        variant={isOnInspectorPage ? "inspector" : "clean"}
      />
    </div>
  );
}

function CopyButton({
  value,
  label = "Copy",
  variant = "inspector",
}: {
  value: string;
  label?: string;
  variant?: "inspector" | "clean";
}) {
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
      className={
        variant === "clean"
          ? styles.secondaryButton
          : styles.inspectorIconButton
      }
      onClick={() => void handleCopy()}
      type="button"
    >
      {copyState === "copied"
        ? "Copied"
        : copyState === "error"
          ? "Failed"
          : label}
    </button>
  );
}

export function UploadedFilesPanel({
  files,
  logId,
}: {
  files: UploadedFile[];
  logId: string;
}) {
  return (
    <div className={styles.inspectorPanel}>
      <SectionLabel title="Uploaded files" />
      <div className="mt-3 grid gap-3">
        {files.map((file, index) => (
          <div
            className={styles.uploadedFileCard}
            key={`${file.fieldName}-${file.fileName}-${index}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div
                  className={cx(
                    styles.inspectorStrong,
                    "truncate text-sm font-semibold",
                  )}
                >
                  {file.fileName}
                </div>
                <div className={cx(styles.inspectorMuted, "mt-1 text-xs")}>
                  Field: {file.fieldName || "file"}
                </div>
              </div>
              <div className={cx(styles.inspectorSoft, "text-xs")}>
                {formatBytes(file.size)}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                className={styles.secondaryButton}
                href={buildApiUrl(`/api/logs/${logId}/files/${index}/download`)}
              >
                Download
              </a>
            </div>
            <div className="mt-3">
              <KeyValueRows
                compact
                items={[
                  { label: "Filename", value: file.fileName, mono: true },
                  {
                    label: "Field",
                    value: file.fieldName || "file",
                    mono: true,
                  },
                  {
                    label: "Content type",
                    value: file.contentType || "unknown",
                    mono: true,
                  },
                  { label: "Size", value: formatBytes(file.size) },
                ]}
              />
            </div>
            {file.savedPath ? (
              <div className="mt-3">
                <SectionLabel title="Saved path" />
                <div className="mt-2">
                  <CopyField value={file.savedPath} />
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatusBadge({
  hasError,
  status,
}: {
  hasError: boolean;
  status: number;
}) {
  const tone =
    hasError || status >= 400 ? styles.statusError : styles.statusSuccess;
  const label = status ? `${status}` : "ERR";

  return <span className={cx(styles.statusBadge, tone)}>{label}</span>;
}

export function SectionLabel({ title }: { title: string }) {
  return (
    <div
      className={cx(
        styles.inspectorMuted,
        "text-xs uppercase tracking-[0.18em]",
      )}
    >
      {title}
    </div>
  );
}

export function KeyValueRows({
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
  const [copiedKey, setCopiedKey] = useState("");

  if (!items.length) {
    return <div className={styles.inspectorEmptyRow}>{emptyLabel}</div>;
  }

  return (
    <>
      <div
        className={cx(
          "space-y-px overflow-hidden rounded-lg border",
          styles.inspectorBorder,
        )}
      >
        {items.map((item) => {
          const shouldExpand =
            item.value.length > 120 || item.value.includes("\n");
          const rowMono = mono || item.mono === true;
          const copyKey = `${item.label}-${item.value}`;

          return (
            <div
              className={cx(
                styles.inspectorKvRow,
                compact && styles.inspectorKvRowCompact,
              )}
              key={copyKey}
            >
              <div className={styles.inspectorKvLabel}>{item.label}</div>
              <div className="flex min-w-0 items-center gap-2">
                <button
                  className={cx(
                    styles.inspectorKvValue,
                    styles.inspectorKvCopy,
                    rowMono && "font-mono",
                    compact && "truncate",
                  )}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(item.value)
                      .then(() => {
                        setCopiedKey(copyKey);
                        window.setTimeout(() => setCopiedKey(""), 1500);
                      })
                      .catch(() => {
                        setCopiedKey("");
                      });
                  }}
                  title={
                    copiedKey === copyKey
                      ? "Copied"
                      : compact
                        ? `${item.value}\n\nClick to copy`
                        : "Click to copy"
                  }
                  type="button"
                >
                  {item.value}
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  {copiedKey === copyKey ? (
                    <span className={styles.inspectorCopyState}>Copied</span>
                  ) : null}
                  {shouldExpand ? (
                    <button
                      className={styles.inspectorExpandButton}
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
            </div>
          );
        })}
      </div>

      {expandedItem ? (
        <div className={styles.inspectorModalBackdrop}>
          <button
            aria-label="Close expanded value"
            className={styles.inspectorModalDismiss}
            onClick={() => setExpandedItem(null)}
            type="button"
          />
          <div
            className={styles.inspectorModal}
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
                <div
                  className={cx(
                    styles.inspectorMuted,
                    "text-[11px] uppercase tracking-[0.18em]",
                  )}
                >
                  {expandedItem.label}
                </div>
                <div
                  className={cx(
                    styles.inspectorStrong,
                    "mt-1 text-sm font-semibold",
                  )}
                >
                  Full value
                </div>
              </div>
              <button
                className={styles.inspectorIconButton}
                onClick={() => setExpandedItem(null)}
                type="button"
              >
                Close
              </button>
            </div>
            <pre
              className={cx(
                styles.inspectorCode,
                "mt-4 max-h-[60vh]",
                expandedItem.mono && "font-mono",
              )}
            >
              {expandedItem.value}
            </pre>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function InspectorBody({
  body,
  theme,
  title,
}: {
  body: LogDetail["request"]["body"];
  theme: WorkspaceTheme;
  title: string;
}) {
  const preview = getBodyPreview(body);

  return (
    <div className={cx(styles.inspectorPanel, "h-full")}>
      <SectionLabel title={title} />
      <div
        className={cx(
          styles.inspectorMuted,
          "mt-3 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em]",
        )}
      >
        <span>{body.contentType || "unknown"}</span>
        <span>{body.size} bytes</span>
        {body.binary ? <span>Binary</span> : null}
        {body.truncated ? <span>Truncated</span> : null}
      </div>
      {preview.kind === "json" ? (
        <JsonPreview theme={theme} value={preview.value} />
      ) : (
        <pre className={cx(styles.inspectorCode, "mb-0")}>{preview.value}</pre>
      )}
    </div>
  );
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
    <div className={styles.jsonViewShell}>
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

export function toKeyValueRows(
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

export function formatDateTime(value: string) {
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

export function formatTime(value: string) {
  const date = new Date(value);

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const rounded =
    size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1);

  return `${rounded} ${units[unitIndex]}`;
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

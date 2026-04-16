"use client";

import JsonView from "@uiw/react-json-view";
import { darkTheme as jsonDarkTheme } from "@uiw/react-json-view/dark";
import { lightTheme as jsonLightTheme } from "@uiw/react-json-view/light";
import { type ReactNode, useState } from "react";

import { buildApiUrl } from "@/lib/api";
import type { LogDetail, PendingWatchRequest, UploadedFile } from "@/types/api";

import type { WorkspaceTheme } from "../use-inspector-workspace";
import styles from "./dashboard.module.css";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type DashboardFrameProps = {
  children: ReactNode;
  errorMessage?: string;
  theme: WorkspaceTheme;
};

export function DashboardFrame({
  children,
  errorMessage,
  theme,
}: DashboardFrameProps) {
  return (
    <div
      className={cx(
        styles.page,
        styles.inspectorPage,
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

export function WatchModeCard({
  enabled,
  isSaving,
  pendingCount,
  projectName,
  timeoutSeconds,
  onOpenQueue,
  onToggle,
  variant = "default",
}: {
  enabled: boolean;
  isSaving: boolean;
  pendingCount: number;
  projectName?: string | null;
  timeoutSeconds: number;
  onOpenQueue: () => void;
  onToggle: (enabled: boolean) => void;
  variant?: "default" | "sidebar";
}) {
  return (
    <div
      className={cx(
        styles.watchModeCard,
        variant === "sidebar" && styles.watchModeCardSidebar,
      )}
    >
      <div className={styles.watchModeSummary}>
        <div className={styles.watchModeInfo}>
          <div className={cx(styles.inspectorStrong, styles.watchModeTitle)}>
            Watch
          </div>
          {projectName ? (
            <div className={cx(styles.inspectorMuted, styles.watchModeProject)}>
              {projectName}
            </div>
          ) : null}
        </div>
        <span
          className={cx(
            styles.statusBadge,
            enabled ? styles.statusSuccess : styles.watchStatusIdle,
          )}
        >
          {enabled ? `${timeoutSeconds}s review` : "Off"}
        </span>
        <div className={styles.watchModeControls}>
          <button
            aria-pressed={enabled}
            className={cx(
              styles.watchToggle,
              enabled && styles.watchToggleEnabled,
              isSaving && styles.watchToggleBusy,
            )}
            disabled={isSaving}
            onClick={() => onToggle(!enabled)}
            type="button"
          >
            <span className={styles.watchToggleThumb} />
            <span className="sr-only">
              {enabled ? "Disable watch mode" : "Enable watch mode"}
            </span>
          </button>
          <button
            className={cx(styles.secondaryButton, styles.watchQueueButton)}
            onClick={onOpenQueue}
            type="button"
          >
            Queue {pendingCount}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WatchRequestsModal({
  pending,
  isResolvingRequestId,
  onApprove,
  onClose,
  onDeny,
  theme,
}: {
  pending: PendingWatchRequest[];
  isResolvingRequestId: string;
  onApprove: (id: string) => void;
  onClose: () => void;
  onDeny: (id: string) => void;
  theme: WorkspaceTheme;
}) {
  if (!pending.length) {
    return null;
  }

  return (
    <div className={styles.inspectorModalBackdrop}>
      <button
        aria-label="Close watch mode queue"
        className={styles.inspectorModalDismiss}
        onClick={onClose}
        type="button"
      />
      <div
        aria-labelledby="watch-mode-modal-title"
        aria-modal="true"
        className={cx(styles.inspectorModal, styles.watchModal)}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div
              className={cx(
                styles.inspectorMuted,
                "text-[11px] uppercase tracking-[0.18em]",
              )}
            >
              Approval queue
            </div>
            <div
              className={cx(
                styles.inspectorStrong,
                "mt-1 text-sm font-semibold",
              )}
              id="watch-mode-modal-title"
            >
              {pending.length} pending request{pending.length === 1 ? "" : "s"}
            </div>
          </div>
          <button
            className={styles.inspectorIconButton}
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className={styles.watchQueueList}>
          {pending.map((request, index) => {
            const isResolving = isResolvingRequestId === request.id;

            return (
              <section className={styles.watchQueueCard} key={request.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className={styles.watchQueueMeta}>
                      <span className={styles.methodPill}>
                        {request.method}
                      </span>
                      <span
                        className={cx(
                          styles.inspectorStrong,
                          "text-sm font-semibold",
                        )}
                      >
                        {request.path}
                      </span>
                    </div>
                    <div className={cx(styles.inspectorMuted, "mt-2 text-xs")}>
                      Queue #{index + 1} · received{" "}
                      {formatDateTime(request.createdAt)}
                    </div>
                  </div>
                  <div className={styles.watchModalActions}>
                    <button
                      className={styles.secondaryButton}
                      disabled={isResolving}
                      onClick={() => onDeny(request.id)}
                      type="button"
                    >
                      {isResolving ? "Working..." : "Block"}
                    </button>
                    <button
                      className={cx(
                        styles.secondaryButton,
                        styles.watchApproveButton,
                      )}
                      disabled={isResolving}
                      onClick={() => onApprove(request.id)}
                      type="button"
                    >
                      {isResolving ? "Working..." : "Approve"}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                  <div
                    className={cx(
                      styles.inspectorCardSurface,
                      styles.inspectorPanel,
                    )}
                  >
                    <KeyValueRows
                      compact
                      items={[
                        {
                          label: "Upstream URL",
                          value: request.fullUrl,
                          mono: true,
                        },
                        { label: "Client IP", value: request.clientIp || "-" },
                        {
                          label: "User Agent",
                          value: request.userAgent || "-",
                        },
                        {
                          label: "Expires",
                          value: formatDateTime(request.expiresAt),
                        },
                      ]}
                    />
                  </div>
                  <div
                    className={cx(
                      styles.inspectorCardSurface,
                      styles.inspectorPanel,
                    )}
                  >
                    <SectionLabel title="Headers" />
                    <div className="mt-3">
                      <KeyValueRows
                        compact
                        emptyLabel="No request headers"
                        items={toKeyValueRows(request.headers)}
                        mono
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <section className={styles.inspectorSection}>
                    <div className="px-4 pt-4">
                      <SectionLabel title="Query strings" />
                    </div>
                    <div className="px-4 pb-4 pt-3">
                      <KeyValueRows
                        compact
                        emptyLabel="None"
                        items={toKeyValueRows(request.query)}
                        mono
                      />
                    </div>
                  </section>

                  <section className={styles.inspectorSection}>
                    <InspectorBody
                      body={request.body}
                      theme={theme}
                      title="Request content"
                    />
                  </section>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CopyField({ value }: { value: string }) {
  return (
    <div className={styles.copyField}>
      <div className={cx(styles.copyFieldValue, "font-mono")}>{value}</div>
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
      className={styles.inspectorIconButton}
      onClick={() => void handleCopy()}
      type="button"
    >
      {copyState === "copied"
        ? "Copied"
        : copyState === "error"
          ? "Failed"
          : "Copy"}
    </button>
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

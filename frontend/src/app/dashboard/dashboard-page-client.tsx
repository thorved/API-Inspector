"use client";

import { useWorkspaceTheme } from "@/components/app-shell";
import {
  methodOptions,
  statusOptions,
  useInspectorWorkspace,
} from "../use-inspector-workspace";
import styles from "./dashboard.module.css";
import {
  DashboardFrame,
  formatDateTime,
  formatTime,
  InspectorBody,
  KeyValueRows,
  SectionLabel,
  StatusBadge,
  toKeyValueRows,
  UploadedFilesPanel,
} from "./dashboard-ui";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function DashboardPageClient() {
  const {
    deletingLogID,
    detail,
    errorMessage,
    handleClearCapturedRequests,
    handleDeleteLog,
    handleLoadMore,
    handleProjectChange,
    handleSelectLog,
    isClearingLogs,
    isLoading,
    logs,
    method,
    nextCursor,
    projects,
    search,
    selectedLog,
    selectedProject,
    selectedProjectRecord,
    setMethod,
    setSearch,
    setStatus,
    stats,
    status,
  } = useInspectorWorkspace({ includeTraffic: true });
  const { theme } = useWorkspaceTheme();

  return (
    <DashboardFrame errorMessage={errorMessage} theme={theme}>
      <div className={styles.inspectorShell}>
        <aside className={styles.inspectorSidebar}>
          <div className={styles.inspectorSidebarTop}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div
                  className={cx(
                    styles.inspectorMuted,
                    "text-[11px] uppercase tracking-[0.18em]",
                  )}
                >
                  Inbox
                </div>
                <div
                  className={cx(
                    styles.inspectorStrong,
                    "mt-1 text-sm font-semibold",
                  )}
                >
                  {logs.length} request{logs.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {logs.length ? (
                  <button
                    className={styles.inspectorIconButton}
                    disabled={isClearingLogs}
                    onClick={() => void handleClearCapturedRequests()}
                    type="button"
                  >
                    {isClearingLogs ? "..." : "Clear"}
                  </button>
                ) : null}
                {isLoading ? <span className={styles.pulseDot} /> : null}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <select
                className={styles.inspectorField}
                onChange={(event) => handleProjectChange(event.target.value)}
                value={selectedProject}
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
                className={styles.inspectorField}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search query"
                value={search}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  className={styles.inspectorField}
                  onChange={(event) => setMethod(event.target.value)}
                  value={method}
                >
                  {methodOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  className={styles.inspectorField}
                  onChange={(event) => setStatus(event.target.value)}
                  value={status}
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

          <div className={styles.inspectorSidebarList}>
            {logs.length ? (
              logs.map((log) => (
                <div
                  className={cx(
                    styles.sidebarRequest,
                    selectedLog === log.id && styles.sidebarRequestActive,
                  )}
                  key={log.id}
                >
                  <div className={styles.sidebarRequestTopRow}>
                    <button
                      className={styles.sidebarRequestContent}
                      onClick={() => handleSelectLog(log.id)}
                      type="button"
                    >
                      <div className={styles.sidebarRequestHeadline}>
                        <span className={styles.methodPill}>{log.method}</span>
                        <span
                          className={cx(
                            styles.inspectorStrong,
                            styles.sidebarRequestPath,
                          )}
                        >
                          {log.path}
                        </span>
                      </div>
                      <div
                        className={cx(
                          styles.inspectorMuted,
                          styles.sidebarRequestUrl,
                        )}
                      >
                        {log.fullUrl}
                      </div>
                      <div className={styles.sidebarRequestFooter}>
                        <div className={styles.sidebarRequestMetrics}>
                          <StatusBadge
                            hasError={log.hasError}
                            status={log.responseStatus}
                          />
                          <span
                            className={cx(
                              styles.inspectorSoft,
                              styles.sidebarRequestMetric,
                            )}
                          >
                            {log.durationMs} ms
                          </span>
                          <span
                            className={cx(
                              styles.inspectorMuted,
                              styles.sidebarRequestMetric,
                            )}
                          >
                            {formatTime(log.createdAt)}
                          </span>
                        </div>
                        {log.errorMessage ? (
                          <span
                            className={cx(
                              styles.inspectorMuted,
                              styles.sidebarRequestError,
                            )}
                            title={log.errorMessage}
                          >
                            {log.errorMessage}
                          </span>
                        ) : null}
                      </div>
                    </button>
                    <button
                      className={cx(
                        styles.inspectorIconButton,
                        styles.sidebarDeleteButton,
                      )}
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
              <div className={cx(styles.inspectorMuted, "px-4 py-6 text-sm")}>
                No traffic yet. Proxy a request through the selected project to
                populate this inbox.
              </div>
            )}
          </div>

          <div className={styles.inspectorSidebarBottom}>
            {nextCursor ? (
              <button
                className={cx(styles.secondaryButton, "mt-3 w-full")}
                onClick={() => void handleLoadMore()}
                type="button"
              >
                Load more
              </button>
            ) : null}
          </div>
        </aside>

        <section className={styles.inspectorPane}>
          <div className={styles.inspectorHead}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div
                  className={cx(
                    styles.inspectorMuted,
                    "text-[11px] uppercase tracking-[0.18em]",
                  )}
                >
                  Request details
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <span
                    className={cx(
                      styles.inspectorStrong,
                      "text-lg font-semibold",
                    )}
                  >
                    {detail?.request.path ?? "Select a request"}
                  </span>
                  {detail ? (
                    <span className={styles.methodPill}>
                      {detail.request.method}
                    </span>
                  ) : null}
                </div>
                <div className={cx(styles.inspectorMuted, "mt-1 text-sm")}>
                  {detail?.project.name ??
                    selectedProjectRecord?.name ??
                    "Choose a project"}
                </div>
              </div>
              <div
                className={cx(
                  styles.inspectorSoft,
                  "flex flex-wrap gap-3 text-sm",
                )}
              >
                <span>{stats.totalRequests} total</span>
                <span>{stats.errorCount} errors</span>
                <span>{Math.round(stats.averageLatencyMs)} ms avg</span>
                {detail ? (
                  <button
                    className={styles.inspectorIconButton}
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

          <div
            className={cx(
              styles.inspectorPaneBody,
              "px-4 py-4 sm:px-5 sm:py-5",
            )}
          >
            {detail ? (
              <div className="space-y-4">
                <section className={styles.inspectorSection}>
                  <div className="px-4 pt-4">
                    <SectionLabel title="Request details & headers" />
                  </div>
                  <div className="grid gap-4 px-4 pb-4 pt-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
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
                    <div
                      className={cx(
                        styles.inspectorCardSurface,
                        styles.inspectorPanel,
                      )}
                    >
                      <SectionLabel title="Request headers" />
                      <div className="mt-3">
                        <KeyValueRows
                          compact
                          emptyLabel="No request headers"
                          items={toKeyValueRows(detail.request.headers)}
                          mono
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <div className="grid gap-4 xl:grid-cols-2">
                  <section className={styles.inspectorSection}>
                    <div className="px-4 pt-4">
                      <SectionLabel title="Query strings" />
                    </div>
                    <div className="px-4 pb-4 pt-3">
                      <KeyValueRows
                        compact
                        emptyLabel="None"
                        items={toKeyValueRows(detail.request.query)}
                        mono
                      />
                    </div>
                  </section>

                  <section className={styles.inspectorSection}>
                    <div className="px-4 pt-4">
                      <SectionLabel title="Response headers" />
                    </div>
                    <div className="px-4 pb-4 pt-3">
                      <KeyValueRows
                        compact
                        emptyLabel="No response headers"
                        items={toKeyValueRows(detail.response.headers)}
                        mono
                      />
                    </div>
                  </section>
                </div>

                {detail.request.uploadedFiles.length ? (
                  <section className={styles.inspectorSection}>
                    <UploadedFilesPanel
                      files={detail.request.uploadedFiles}
                      logId={detail.id}
                    />
                  </section>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-2">
                  <section className={styles.inspectorSection}>
                    <InspectorBody
                      body={detail.request.body}
                      theme={theme}
                      title="Request content"
                    />
                  </section>

                  <section className={styles.inspectorSection}>
                    <InspectorBody
                      body={detail.response.body}
                      theme={theme}
                      title="Response body"
                    />
                  </section>
                </div>

                {detail.error ? (
                  <div className={styles.errorBox}>{detail.error}</div>
                ) : null}
              </div>
            ) : (
              <div className={styles.inspectorEmpty}>
                Select a request from the left sidebar to inspect its headers,
                query params, and body.
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardFrame>
  );
}

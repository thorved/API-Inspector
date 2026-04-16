"use client";

import { useEffect, useState } from "react";

import { useWorkspaceTheme } from "@/components/app-shell";
import {
  methodOptions,
  statusOptions,
  useInspectorWorkspace,
} from "../use-inspector-workspace";
import styles from "./dashboard.module.css";
import {
  ConfirmActionModal,
  DashboardFrame,
  formatDateTime,
  formatTime,
  InspectorBody,
  KeyValueRows,
  SectionLabel,
  StatusBadge,
  toKeyValueRows,
  UploadedFilesPanel,
  WatchModeCard,
  WatchRequestsModal,
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
    handleResolveWatchRequest,
    handleSelectLog,
    handleWatchToggle,
    isClearingLogs,
    isLoading,
    isResolvingWatchRequest,
    isSavingWatchState,
    logs,
    method,
    nextCursor,
    pendingWatchRequests,
    projects,
    search,
    selectedLog,
    selectedProject,
    selectedProjectRecord,
    setMethod,
    setSearch,
    setStatus,
    status,
    watchEnabled,
    watchTimeoutSeconds,
  } = useInspectorWorkspace({ includeTraffic: true });
  const { theme } = useWorkspaceTheme();
  const [isWatchModalOpen, setIsWatchModalOpen] = useState(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [logPendingDelete, setLogPendingDelete] = useState<{
    id: string;
    method: string;
    path: string;
    fullUrl: string;
    createdAt: string;
  } | null>(null);
  const [activeRequestTab, setActiveRequestTab] = useState<
    "overview" | "headers" | "query" | "body" | "files"
  >("overview");
  const [activeResponseTab, setActiveResponseTab] = useState<
    "overview" | "headers" | "body" | "error"
  >("overview");

  useEffect(() => {
    if (pendingWatchRequests.length > 0) {
      setIsWatchModalOpen(true);
    }
  }, [pendingWatchRequests.length]);

  useEffect(() => {
    if (pendingWatchRequests.length === 0) {
      setIsWatchModalOpen(false);
    }
  }, [pendingWatchRequests]);

  useEffect(() => {
    if (!detail) {
      setActiveRequestTab("overview");
      setActiveResponseTab("overview");
      return;
    }

    if (!detail.request.uploadedFiles.length && activeRequestTab === "files") {
      setActiveRequestTab("overview");
    }

    if (!detail.error && activeResponseTab === "error") {
      setActiveResponseTab("overview");
    }
  }, [activeRequestTab, activeResponseTab, detail]);

  useEffect(() => {
    if (!logPendingDelete) {
      return;
    }

    const stillExists = logs.some((log) => log.id === logPendingDelete.id);
    if (!stillExists) {
      setLogPendingDelete(null);
    }
  }, [logPendingDelete, logs]);

  function openDeleteLogModal(log: {
    id: string;
    method: string;
    path: string;
    fullUrl: string;
    createdAt: string;
  }) {
    setLogPendingDelete(log);
  }

  async function handleConfirmDeleteLog() {
    if (!logPendingDelete) {
      return;
    }

    const deleted = await handleDeleteLog(logPendingDelete.id);
    if (deleted) {
      setLogPendingDelete(null);
    }
  }

  async function handleConfirmClearLogs() {
    const cleared = await handleClearCapturedRequests();
    if (cleared) {
      setIsClearModalOpen(false);
    }
  }

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
                    onClick={() => setIsClearModalOpen(true)}
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
              {selectedProjectRecord ? (
                <div className={styles.sidebarWatchRow}>
                  <div className={styles.sidebarWatchCard}>
                    <WatchModeCard
                      enabled={watchEnabled}
                      isSaving={isSavingWatchState}
                      onOpenQueue={() => setIsWatchModalOpen(true)}
                      onToggle={(enabled) => void handleWatchToggle(enabled)}
                      pendingCount={pendingWatchRequests.length}
                      projectName={selectedProjectRecord.name}
                      timeoutSeconds={watchTimeoutSeconds}
                      variant="sidebar"
                    />
                  </div>
                </div>
              ) : null}
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
                      onClick={() =>
                        openDeleteLogModal({
                          id: log.id,
                          method: log.method,
                          path: log.path,
                          fullUrl: log.fullUrl,
                          createdAt: log.createdAt,
                        })
                      }
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
          <div
            className={cx(
              styles.inspectorPaneBody,
              "px-4 py-4 sm:px-5 sm:py-5",
            )}
          >
            {detail ? (
              <div className={styles.detailWorkspace}>
                <div className={styles.detailSplit}>
                  <section className={styles.detailPane}>
                    <div className={styles.detailPaneShell}>
                      <div className={styles.detailPaneIntro}>
                        <div>
                          <SectionLabel title="Request" />
                          <div
                            className={cx(
                              styles.inspectorStrong,
                              styles.detailPaneTitle,
                            )}
                          >
                            {detail.request.method} {detail.request.path}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={styles.methodPill}>
                            {detail.request.method}
                          </span>
                          <button
                            className={styles.inspectorIconButton}
                            disabled={deletingLogID === detail.id}
                            onClick={() =>
                              openDeleteLogModal({
                                id: detail.id,
                                method: detail.request.method,
                                path: detail.request.path,
                                fullUrl: detail.request.url,
                                createdAt: detail.createdAt,
                              })
                            }
                            type="button"
                          >
                            {deletingLogID === detail.id
                              ? "Removing..."
                              : "Remove"}
                          </button>
                        </div>
                      </div>

                      <div className={styles.detailTabBar}>
                        <button
                          className={cx(
                            styles.tabButton,
                            activeRequestTab === "overview" &&
                              styles.tabButtonActive,
                          )}
                          onClick={() => setActiveRequestTab("overview")}
                          type="button"
                        >
                          Overview
                        </button>
                        <button
                          className={cx(
                            styles.tabButton,
                            activeRequestTab === "headers" &&
                              styles.tabButtonActive,
                          )}
                          onClick={() => setActiveRequestTab("headers")}
                          type="button"
                        >
                          Headers
                        </button>
                        <button
                          className={cx(
                            styles.tabButton,
                            activeRequestTab === "query" &&
                              styles.tabButtonActive,
                          )}
                          onClick={() => setActiveRequestTab("query")}
                          type="button"
                        >
                          Params
                        </button>
                        <button
                          className={cx(
                            styles.tabButton,
                            activeRequestTab === "body" &&
                              styles.tabButtonActive,
                          )}
                          onClick={() => setActiveRequestTab("body")}
                          type="button"
                        >
                          Body
                        </button>
                        {detail.request.uploadedFiles.length ? (
                          <button
                            className={cx(
                              styles.tabButton,
                              activeRequestTab === "files" &&
                                styles.tabButtonActive,
                            )}
                            onClick={() => setActiveRequestTab("files")}
                            type="button"
                          >
                            Files
                          </button>
                        ) : null}
                      </div>

                      <div className={styles.detailTabBody}>
                        <div className={styles.detailTabContent}>
                          {activeRequestTab === "overview" ? (
                            <section className={styles.inspectorSection}>
                              <div className="px-4 pt-4">
                                <SectionLabel title="Request overview" />
                              </div>
                              <div className="px-4 pb-4 pt-3">
                                <KeyValueRows
                                  compact
                                  items={[
                                    {
                                      label: "URL",
                                      value: detail.request.url,
                                      mono: true,
                                    },
                                    {
                                      label: "Project",
                                      value: detail.project.name,
                                    },
                                    {
                                      label: "Captured",
                                      value: formatDateTime(detail.createdAt),
                                    },
                                    {
                                      label: "Duration",
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
                            </section>
                          ) : null}

                          {activeRequestTab === "headers" ? (
                            <section className={styles.inspectorSection}>
                              <div className="px-4 pt-4">
                                <SectionLabel title="Request headers" />
                              </div>
                              <div className="px-4 pb-4 pt-3">
                                <KeyValueRows
                                  compact
                                  emptyLabel="No request headers"
                                  items={toKeyValueRows(detail.request.headers)}
                                  mono
                                />
                              </div>
                            </section>
                          ) : null}

                          {activeRequestTab === "query" ? (
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
                          ) : null}

                          {activeRequestTab === "body" ? (
                            <section className={styles.inspectorSection}>
                              <InspectorBody
                                body={detail.request.body}
                                theme={theme}
                                title="Request content"
                              />
                            </section>
                          ) : null}

                          {activeRequestTab === "files" &&
                          detail.request.uploadedFiles.length ? (
                            <section className={styles.inspectorSection}>
                              <UploadedFilesPanel
                                files={detail.request.uploadedFiles}
                                logId={detail.id}
                              />
                            </section>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className={styles.detailPane}>
                    <div className={styles.detailPaneShell}>
                      <div className={styles.detailPaneIntro}>
                        <div>
                          <SectionLabel title="Response" />
                          <div
                            className={cx(
                              styles.inspectorStrong,
                              styles.detailPaneTitle,
                            )}
                          >
                            {detail.response.status
                              ? `${detail.response.status} response`
                              : "Upstream error"}
                          </div>
                        </div>
                        <StatusBadge
                          hasError={Boolean(detail.error)}
                          status={detail.response.status}
                        />
                      </div>

                      <div className={styles.detailTabBar}>
                        <button
                          className={cx(
                            styles.tabButton,
                            activeResponseTab === "overview" &&
                              styles.tabButtonActive,
                          )}
                          onClick={() => setActiveResponseTab("overview")}
                          type="button"
                        >
                          Overview
                        </button>
                        <button
                          className={cx(
                            styles.tabButton,
                            activeResponseTab === "headers" &&
                              styles.tabButtonActive,
                          )}
                          onClick={() => setActiveResponseTab("headers")}
                          type="button"
                        >
                          Headers
                        </button>
                        <button
                          className={cx(
                            styles.tabButton,
                            activeResponseTab === "body" &&
                              styles.tabButtonActive,
                          )}
                          onClick={() => setActiveResponseTab("body")}
                          type="button"
                        >
                          Body
                        </button>
                        {detail.error ? (
                          <button
                            className={cx(
                              styles.tabButton,
                              activeResponseTab === "error" &&
                                styles.tabButtonActive,
                            )}
                            onClick={() => setActiveResponseTab("error")}
                            type="button"
                          >
                            Error
                          </button>
                        ) : null}
                      </div>

                      <div className={styles.detailTabBody}>
                        <div className={styles.detailTabContent}>
                          {activeResponseTab === "overview" ? (
                            <section className={styles.inspectorSection}>
                              <div className="px-4 pt-4">
                                <SectionLabel title="Response overview" />
                              </div>
                              <div className="px-4 pb-4 pt-3">
                                <KeyValueRows
                                  compact
                                  items={[
                                    {
                                      label: "Status",
                                      value: detail.response.status
                                        ? `${detail.response.status}`
                                        : "Upstream error",
                                    },
                                    {
                                      label: "Result",
                                      value: detail.error
                                        ? "Failed before upstream response"
                                        : "Delivered from upstream",
                                    },
                                    {
                                      label: "Captured",
                                      value: formatDateTime(detail.createdAt),
                                    },
                                    {
                                      label: "Duration",
                                      value: `${detail.durationMs} ms`,
                                    },
                                    {
                                      label: "Content type",
                                      value:
                                        detail.response.body.contentType ||
                                        "unknown",
                                    },
                                    {
                                      label: "Payload size",
                                      value: `${detail.response.body.size} bytes`,
                                    },
                                  ]}
                                />
                              </div>
                            </section>
                          ) : null}

                          {activeResponseTab === "headers" ? (
                            <section className={styles.inspectorSection}>
                              <div className="px-4 pt-4">
                                <SectionLabel title="Response headers" />
                              </div>
                              <div className="px-4 pb-4 pt-3">
                                <KeyValueRows
                                  compact
                                  emptyLabel="No response headers"
                                  items={toKeyValueRows(
                                    detail.response.headers,
                                  )}
                                  mono
                                />
                              </div>
                            </section>
                          ) : null}

                          {activeResponseTab === "body" ? (
                            <section className={styles.inspectorSection}>
                              <InspectorBody
                                body={detail.response.body}
                                theme={theme}
                                title="Response body"
                              />
                            </section>
                          ) : null}

                          {activeResponseTab === "error" && detail.error ? (
                            <div className={styles.errorBox}>
                              {detail.error}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
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
      {isWatchModalOpen ? (
        <WatchRequestsModal
          isResolvingRequestId={isResolvingWatchRequest}
          onApprove={(id) => void handleResolveWatchRequest(id, "approve")}
          onClose={() => setIsWatchModalOpen(false)}
          onDeny={(id) => void handleResolveWatchRequest(id, "deny")}
          pending={pendingWatchRequests}
          theme={theme}
        />
      ) : null}
      <ConfirmActionModal
        confirmLabel="Clear requests"
        description="This removes every captured request for the selected project from the dashboard history."
        isBusy={isClearingLogs}
        isDestructive
        isOpen={isClearModalOpen}
        onCancel={() => setIsClearModalOpen(false)}
        onConfirm={() => void handleConfirmClearLogs()}
        title="Clear captured requests?"
        warningMeta={
          selectedProjectRecord
            ? `/proxy/${selectedProjectRecord.slug}`
            : undefined
        }
        warningTitle="Project"
        warningValue={selectedProjectRecord?.name ?? "Current project"}
      />
      <ConfirmActionModal
        confirmLabel="Remove request"
        description="This removes the selected captured request from the dashboard history."
        isBusy={Boolean(
          logPendingDelete && deletingLogID === logPendingDelete.id,
        )}
        isDestructive
        isOpen={Boolean(logPendingDelete)}
        onCancel={() => setLogPendingDelete(null)}
        onConfirm={() => void handleConfirmDeleteLog()}
        title="Remove captured request?"
        warningMeta={
          logPendingDelete
            ? `${logPendingDelete.method} · ${formatDateTime(logPendingDelete.createdAt)}`
            : undefined
        }
        warningTitle={logPendingDelete?.path ?? "Request"}
        warningValue={logPendingDelete?.fullUrl ?? ""}
      />
    </DashboardFrame>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

import { useWorkspaceTheme } from "@/components/app-shell";
import type { Project } from "@/types/api";
import { useInspectorWorkspace } from "../use-inspector-workspace";
import styles from "./projects.module.css";
import {
  ProjectDeleteModal,
  ProjectDetailsPane,
  ProjectFormModal,
  ProjectSidebar,
  ProjectsFrame,
} from "./projects-ui";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function ProjectsPageClient() {
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectPendingDelete, setProjectPendingDelete] =
    useState<Project | null>(null);
  const {
    deletingProjectSlug,
    editingProjectSlug,
    errorMessage,
    form,
    handleCancelProjectEdit,
    handleDeleteProject,
    handleEditProject,
    handleProjectFormChange,
    handleProjectChange,
    handleSubmitProject,
    isLoading,
    isSavingProject,
    projectFormErrorMessage,
    projects,
    selectedProject,
    selectedProjectRecord,
    stats,
  } = useInspectorWorkspace({ includeTraffic: true });
  const { theme } = useWorkspaceTheme();

  function handleOpenCreateModal() {
    handleCancelProjectEdit();
    setIsProjectModalOpen(true);
  }

  function handleOpenEditModal(
    project: Parameters<typeof handleEditProject>[0],
  ) {
    handleEditProject(project);
    setIsProjectModalOpen(true);
  }

  function handleCloseProjectModal() {
    handleCancelProjectEdit();
    setIsProjectModalOpen(false);
  }

  function handleOpenDeleteModal(project: Project) {
    setProjectPendingDelete(project);
  }

  function handleCloseDeleteModal() {
    if (
      projectPendingDelete &&
      deletingProjectSlug === projectPendingDelete.slug
    ) {
      return;
    }

    setProjectPendingDelete(null);
  }

  async function handleProjectSubmit(
    event: Parameters<typeof handleSubmitProject>[0],
  ) {
    const saved = await handleSubmitProject(event);

    if (saved) {
      setIsProjectModalOpen(false);
    }

    return saved;
  }

  async function handleConfirmDeleteProject() {
    if (!projectPendingDelete) {
      return false;
    }

    const deleted = await handleDeleteProject(projectPendingDelete.slug);
    if (deleted) {
      setProjectPendingDelete(null);
    }

    return deleted;
  }

  return (
    <ProjectsFrame errorMessage={errorMessage} theme={theme}>
      <section
        className={cx(
          styles.glassPanel,
          styles.tablePanel,
          "flex h-full min-h-0 flex-1 flex-col p-5",
        )}
      >
        <div className={styles.tableToolbar}>
          <div className={styles.toolbarSummary}>
            <div className={styles.workspaceCaption}>Total Projects</div>
            <div className={styles.toolbarCount}>{projects.length}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={cx(styles.primaryButton, styles.toolbarButton)}
              onClick={handleOpenCreateModal}
              type="button"
            >
              <PlusIcon />
              <span>Add Project</span>
            </button>
            <Link
              className={cx(styles.secondaryButton, styles.toolbarButton)}
              href="/dashboard"
            >
              <DashboardIcon />
              <span>Dashboard</span>
            </Link>
          </div>
        </div>

        <div className={styles.projectsShell}>
          <ProjectSidebar
            deletingProjectSlug={deletingProjectSlug}
            isLoading={isLoading}
            onDeleteProject={handleOpenDeleteModal}
            onEditProject={handleOpenEditModal}
            onSelectProject={handleProjectChange}
            projects={projects}
            selectedProject={selectedProject}
          />
          <ProjectDetailsPane
            onEditProject={handleOpenEditModal}
            project={selectedProjectRecord}
            stats={stats}
          />
        </div>
      </section>

      <ProjectFormModal
        editingProjectSlug={editingProjectSlug}
        errorMessage={projectFormErrorMessage}
        form={form}
        isOpen={isProjectModalOpen}
        isSavingProject={isSavingProject}
        onCancelEdit={handleCloseProjectModal}
        onChange={handleProjectFormChange}
        onSubmit={handleProjectSubmit}
      />
      <ProjectDeleteModal
        deletingProjectSlug={deletingProjectSlug}
        isOpen={projectPendingDelete !== null}
        onCancel={handleCloseDeleteModal}
        onConfirm={handleConfirmDeleteProject}
        project={projectPendingDelete}
      />
    </ProjectsFrame>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M8 3.333v9.334M3.333 8h9.334"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M3.333 3.333h4v4h-4zm5.334 0h4v2.667h-4zm0 4h4v5.334h-4zm-5.334 1.334h4v4h-4z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}

"use client";

import styles from "../_workspace/workspace.module.css";
import { useInspectorWorkspace } from "../_workspace/workspace-state";
import {
  ProjectForm,
  ProjectList,
  WorkspaceFrame,
} from "../_workspace/workspace-ui";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function ProjectsPageClient() {
  const {
    deletingProjectSlug,
    editingProjectSlug,
    errorMessage,
    form,
    handleCancelProjectEdit,
    handleDeleteProject,
    handleEditProject,
    handleProjectChange,
    handleSubmitProject,
    isSavingProject,
    projects,
    selectedProject,
    setForm,
    setTheme,
    theme,
  } = useInspectorWorkspace();

  return (
    <WorkspaceFrame
      currentPage="projects"
      errorMessage={errorMessage}
      setTheme={setTheme}
      theme={theme}
    >
      <section className={cx(styles.glassPanel, styles.workspaceHero, "p-6")}>
        <div className={styles.badge}>Project workspace</div>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
          <div>
            <h1 className={styles.workspaceDisplay}>
              Separate project setup with theme-aware controls and cleaner copy
              targets.
            </h1>
            <p
              className={cx(
                styles.workspaceMuted,
                "mt-4 max-w-2xl text-base leading-7 sm:text-lg",
              )}
            >
              Manage proxy routes here, keep dashboard traffic review on its own
              page, and switch light or dark mode without losing contrast on the
              project cards and forms.
            </p>
          </div>
          <div className={styles.workspaceHeroAside}>
            <div className={styles.workspaceCaption}>Configured projects</div>
            <div
              className={cx(
                styles.workspaceStrong,
                "mt-2 text-4xl font-semibold",
              )}
            >
              {projects.length}
            </div>
            <p className={cx(styles.workspaceMuted, "mt-3 text-sm leading-6")}>
              Pick a project to make it the active workspace for the dashboard,
              or update the slug and upstream URL from the editor below.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
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
          onSelectProject={handleProjectChange}
          projects={projects}
          selectedProject={selectedProject}
        />
      </section>
    </WorkspaceFrame>
  );
}

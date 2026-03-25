"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import type { CreateProjectInput, Project } from "@/types/api";

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
    <div className={cx(styles.page, styles.cleanPage)} data-theme={theme}>
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-5 lg:px-6">
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
                      value={`${origin || ""}/proxy/${project.slug}`}
                    />
                  </div>
                  <div className={cx(styles.workspaceCaption, "mt-3")}>
                    Full URL
                  </div>
                  <div className="mt-1">
                    <CopyField mono={false} value={project.baseUrl} />
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
      className={styles.secondaryButton}
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

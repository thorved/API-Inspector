"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import { useWorkspaceTheme } from "@/components/app-shell";
import { getSettings, updateSettings } from "@/lib/api";
import type { AppSettings } from "@/types/api";

import styles from "./settings.module.css";

const defaultSettings: AppSettings = {
  port: 8080,
  databasePath: "data/api-inspector.db",
  bodyPreviewLimit: 0,
  logPageSize: 50,
  upstreamTimeoutSeconds: 600,
  watchTimeoutSeconds: 30,
};

export function SettingsPageClient() {
  const { theme } = useWorkspaceTheme();
  const [form, setForm] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const payload = await getSettings();
        if (cancelled) {
          return;
        }

        setForm(payload);
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

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setSuccessMessage("");

    try {
      const payload = await updateSettings(form);
      setForm(payload.settings);
      setErrorMessage("");
      setSuccessMessage(payload.message);
    } catch (error) {
      setErrorMessage(toMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className={styles.page} data-theme={theme}>
      <div
        className={`${styles.pageInner} mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-5 lg:px-6`}
      >
        {errorMessage ? (
          <section className={styles.alertError}>{errorMessage}</section>
        ) : null}
        {successMessage ? (
          <section className={styles.alertSuccess}>{successMessage}</section>
        ) : null}

        <section className={styles.hero}>
          <div>
            <div className={styles.badge}>Runtime settings</div>
            <h1 className={styles.title}>
              Control startup configuration from one settings file.
            </h1>
            <p className={styles.copy}>
              API-Inspector now stores runtime config in{" "}
              <code>data/settings.conf</code>. Edit the values here, save them
              to disk, then restart the app to apply the changes.
            </p>
          </div>
          <div className={styles.heroCard}>
            <div className={styles.metaLabel}>Config file</div>
            <div className={styles.metaValue}>data/settings.conf</div>
            <p className={styles.metaCopy}>
              Port, log page size, upstream timeout, watch timeout, and database
              path all live in this JSON file.
            </p>
          </div>
        </section>

        <form className={styles.formShell} onSubmit={handleSubmit}>
          <section className={styles.section}>
            <div>
              <div className={styles.sectionLabel}>Network</div>
              <h2 className={styles.sectionTitle}>
                Startup and traffic handling
              </h2>
            </div>
            <div className={styles.grid}>
              <Field htmlFor="settings-port" label="Port">
                <input
                  className={styles.field}
                  disabled={isLoading}
                  id="settings-port"
                  min={1}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      port: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={form.port}
                />
              </Field>

              <Field
                htmlFor="settings-upstream-timeout"
                label="Upstream timeout (seconds)"
              >
                <input
                  className={styles.field}
                  disabled={isLoading}
                  id="settings-upstream-timeout"
                  min={1}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      upstreamTimeoutSeconds: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={form.upstreamTimeoutSeconds}
                />
              </Field>

              <Field
                htmlFor="settings-watch-timeout"
                label="Watch approval timeout (seconds)"
              >
                <input
                  className={styles.field}
                  disabled={isLoading}
                  id="settings-watch-timeout"
                  min={1}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      watchTimeoutSeconds: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={form.watchTimeoutSeconds}
                />
              </Field>
            </div>
          </section>

          <section className={styles.section}>
            <div>
              <div className={styles.sectionLabel}>Storage</div>
              <h2 className={styles.sectionTitle}>
                Persistence and capture limits
              </h2>
            </div>
            <div className={styles.grid}>
              <Field htmlFor="settings-database-path" label="Database path">
                <input
                  className={styles.field}
                  disabled={isLoading}
                  id="settings-database-path"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      databasePath: event.target.value,
                    }))
                  }
                  placeholder="data/api-inspector.db"
                  value={form.databasePath}
                />
              </Field>

              <Field htmlFor="settings-log-page-size" label="Log page size">
                <input
                  className={styles.field}
                  disabled={isLoading}
                  id="settings-log-page-size"
                  min={1}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      logPageSize: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={form.logPageSize}
                />
              </Field>

              <Field
                htmlFor="settings-body-preview-limit"
                label="Body preview limit (bytes)"
              >
                <input
                  className={styles.field}
                  disabled={isLoading}
                  id="settings-body-preview-limit"
                  min={0}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      bodyPreviewLimit: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={form.bodyPreviewLimit}
                />
              </Field>
            </div>
          </section>

          <div className={styles.actions}>
            <p className={styles.restartNotice}>
              Saved changes update <code>data/settings.conf</code> immediately,
              but the running app keeps its current values until you restart it.
            </p>
            <button
              className={styles.primaryButton}
              disabled={isLoading || isSaving}
              type="submit"
            >
              {isSaving
                ? "Saving..."
                : isLoading
                  ? "Loading..."
                  : "Save settings"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className={styles.fieldGroup}>
      <label className={styles.fieldLabel} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

function toMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while talking to the API.";
}

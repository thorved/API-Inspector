"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import styles from "./app-navbar.module.css";

type WorkspaceTheme = "light" | "dark";

type WorkspaceThemeContextValue = {
  theme: WorkspaceTheme;
  setTheme: (theme: WorkspaceTheme) => void;
};

const WorkspaceThemeContext = createContext<WorkspaceThemeContextValue | null>(
  null,
);

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AppShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<WorkspaceTheme>("light");
  const pathname = usePathname();
  const isDashboard = pathname.startsWith("/dashboard");
  const isProjects = pathname.startsWith("/projects");
  const isWorkspacePage = isDashboard || isProjects;

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(
      "api-inspector-workspace-theme",
    ) as WorkspaceTheme | null;

    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("api-inspector-workspace-theme", theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return (
    <WorkspaceThemeContext.Provider value={value}>
      <div
        className={cx(
          "flex flex-col",
          isWorkspacePage ? "h-screen overflow-hidden" : "min-h-screen",
        )}
      >
        <AppNavbar />
        <div
          className={cx("flex-1 min-h-0", isWorkspacePage && "overflow-hidden")}
        >
          {children}
        </div>
      </div>
    </WorkspaceThemeContext.Provider>
  );
}

export function useWorkspaceTheme() {
  const context = useContext(WorkspaceThemeContext);

  if (!context) {
    throw new Error("useWorkspaceTheme must be used inside AppShell.");
  }

  return context;
}

function AppNavbar() {
  const pathname = usePathname();
  const { theme, setTheme } = useWorkspaceTheme();
  const isDashboard = pathname.startsWith("/dashboard");
  const isProjects = pathname.startsWith("/projects");
  const variant = isDashboard ? "dashboard" : "clean";

  return (
    <nav className={styles.nav} data-theme={theme} data-variant={variant}>
      <div className={styles.inner}>
        <div className={styles.leftCluster}>
          <Link className={styles.brand} href="/">
            <span className={styles.brandMark} aria-hidden="true" />
            <span className={styles.brandText}>API-Inspector</span>
          </Link>
          <div className={styles.navRail}>
            <Link
              className={cx(
                styles.navButton,
                isDashboard && styles.navButtonActive,
              )}
              href="/dashboard"
            >
              Traffic workspace
            </Link>
            <Link
              className={cx(
                styles.navButton,
                isProjects && styles.navButtonActive,
              )}
              href="/projects"
            >
              Projects
            </Link>
          </div>
        </div>

        <div className={styles.themeSwitch}>
          <button
            className={cx(
              styles.navButton,
              styles.themeButton,
              theme === "light" && styles.navButtonActive,
            )}
            onClick={() => setTheme("light")}
            type="button"
          >
            Light
          </button>
          <button
            className={cx(
              styles.navButton,
              styles.themeButton,
              theme === "dark" && styles.navButtonActive,
            )}
            onClick={() => setTheme("dark")}
            type="button"
          >
            Dark
          </button>
        </div>
      </div>
    </nav>
  );
}

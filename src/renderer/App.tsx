import { useCallback, useEffect, useState } from "react";
import type { NavSection, SessionUser, UpdateStatus } from "../shared/udeler.d.ts";
import { BusyOverlay } from "./components/BusyOverlay";
import { Sidebar } from "./components/Sidebar";
import { UpdateBanner } from "./components/UpdateBanner";
import { getUdeler } from "./hooks/useUdeler";
import { useI18n } from "./hooks/useI18n";
import { AboutPage } from "./pages/AboutPage";
import { CoursesPage } from "./pages/CoursesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LibraryPage } from "./pages/LibraryPage";
import { LoggerPage } from "./pages/LoggerPage";
import { LoginPage } from "./pages/LoginPage";
import { SettingsPage } from "./pages/SettingsPage";

type AppView = "boot" | "login" | "dashboard";

interface QueueStatus {
	running: number;
	pending: number;
	concurrency: number;
}

const IDLE_UPDATE: UpdateStatus = {
	phase: "idle",
	currentVersion: "",
	availableVersion: null,
	releaseNotes: null,
	percent: 0,
	error: null,
	packaged: false,
	buildId: 0,
	remoteBuildId: null,
};

function applyAppearanceFromSettings() {
	const api = getUdeler();
	const snapshot = api?.settings.getSnapshot();
	const theme = snapshot?.theme === "light" ? "light" : "dark";
	const density = snapshot?.uiDensity === "compact" ? "compact" : "comfortable";
	document.documentElement.classList.toggle("dark", theme === "dark");
	document.documentElement.classList.toggle("light", theme === "light");
	document.documentElement.setAttribute("data-theme", theme);
	document.documentElement.setAttribute("data-density", density);
}

const SECTION_BY_DIGIT: Record<string, NavSection> = {
	"1": "courses",
	"2": "library",
	"3": "dashboard",
	"4": "settings",
	"5": "logger",
};

export default function App() {
	const { t } = useI18n();
	const [view, setView] = useState<AppView>("boot");
	const [section, setSection] = useState<NavSection>("courses");
	const [user, setUser] = useState<SessionUser | null>(null);
	const [busy, setBusy] = useState(false);
	const [busyMessage, setBusyMessage] = useState<string | undefined>();
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(IDLE_UPDATE);
	const [updateDismissed, setUpdateDismissed] = useState(false);
	const [queue, setQueue] = useState<QueueStatus>({
		running: 0,
		pending: 0,
		concurrency: 2,
	});

	const onBusy = useCallback((next: boolean, message?: string) => {
		setBusy(next);
		setBusyMessage(message);
	}, []);

	const refreshQueue = useCallback(() => {
		const api = getUdeler();
		if (!api) return;
		setQueue(api.downloads.getQueueStatus());
	}, []);

	useEffect(() => {
		applyAppearanceFromSettings();
		const api = getUdeler();
		if (!api) {
			setView("login");
			return;
		}

		let cancelled = false;
		(async () => {
			onBusy(true, t("Loading"));
			try {
				const session = await api.auth.checkSession();
				if (cancelled) return;
				if (session.ok && session.user) {
					setUser(session.user);
					setView("dashboard");
					refreshQueue();
				} else {
					setUser(null);
					setView("login");
				}
			} catch {
				if (!cancelled) {
					setView("login");
				}
			} finally {
				if (!cancelled) onBusy(false);
			}
		})();

		const unsubSave = api.app.onSaveDownloads(() => {
			api.downloads.saveHistory();
		});

		const unsubUpdates = api.updates?.onState?.((status) => {
			setUpdateStatus(status);
			if (status.phase === "available" || status.phase === "downloaded") {
				setUpdateDismissed(false);
			}
		});

		void api.updates?.getStatus?.().then((status) => {
			if (!cancelled) setUpdateStatus(status);
		});

		const restored = api.downloads.restoreQueue?.();
		if (restored && restored.restored > 0) {
			refreshQueue();
		}

		return () => {
			cancelled = true;
			unsubSave();
			unsubUpdates?.();
		};
	}, [onBusy, refreshQueue, t]);

	useEffect(() => {
		const api = getUdeler();
		if (!api?.updates || !api.env.isPackage) return;
		const enabled = api.settings.getSnapshot()?.download?.checkNewVersion !== false;
		if (!enabled) return;

		const timer = window.setTimeout(() => {
			void api.updates.check({ silent: true });
		}, 4000);

		return () => window.clearTimeout(timer);
	}, [view]);

	useEffect(() => {
		if (view !== "dashboard") return;

		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase();
			const typing =
				tag === "input" ||
				tag === "textarea" ||
				tag === "select" ||
				target?.isContentEditable;

			if (event.key === "?" && !typing) {
				event.preventDefault();
				setShortcutsOpen((open) => !open);
				return;
			}
			if (event.key === "Escape") {
				setShortcutsOpen(false);
				return;
			}
			if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

			const next = SECTION_BY_DIGIT[event.key];
			if (next) {
				event.preventDefault();
				setSection(next);
				return;
			}
			if (event.key.toLowerCase() === "d") {
				event.preventDefault();
				setSection("dashboard");
			}
		};

		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [view]);

	const handleLogout = () => {
		const api = getUdeler();
		api?.downloads.saveHistory();
		api?.auth.logout();
		setUser(null);
		setSection("courses");
		setView("login");
	};

	const handleLoggedIn = (nextUser: SessionUser) => {
		setUser(nextUser);
		setView("dashboard");
		setSection("courses");
		refreshQueue();
		applyAppearanceFromSettings();
	};

	const showUpdateBanner =
		!updateDismissed &&
		(updateStatus.phase === "available" ||
			updateStatus.phase === "downloading" ||
			updateStatus.phase === "downloaded" ||
			(updateStatus.phase === "error" && Boolean(updateStatus.error)));

	if (view === "boot") {
		return <BusyOverlay visible message={t("Loading")} />;
	}

	if (view === "login") {
		return (
			<>
				{showUpdateBanner ? (
					<UpdateBanner
						status={updateStatus}
						onDownload={() => void getUdeler()?.updates.download()}
						onInstall={() => void getUdeler()?.updates.install()}
						onDismiss={() => setUpdateDismissed(true)}
					/>
				) : null}
				<LoginPage onLoggedIn={handleLoggedIn} onBusy={onBusy} />
				<BusyOverlay visible={busy} message={busyMessage} />
			</>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col bg-ud-bg text-ud-text">
			{showUpdateBanner ? (
				<UpdateBanner
					status={updateStatus}
					onDownload={() => void getUdeler()?.updates.download()}
					onInstall={() => void getUdeler()?.updates.install()}
					onDismiss={() => setUpdateDismissed(true)}
				/>
			) : null}
			<div className="flex min-h-0 flex-1">
				<Sidebar
					active={section}
					user={user}
					queue={queue}
					onNavigate={setSection}
					onLogout={handleLogout}
				/>
				<main className="ud-main min-h-0 flex-1 overflow-y-auto">
					{section === "courses" && (
						<CoursesPage onBusy={onBusy} onQueueChange={refreshQueue} />
					)}
					{section === "library" && <LibraryPage onBusy={onBusy} />}
					{section === "dashboard" && (
						<DashboardPage onOpenLibrary={() => setSection("library")} />
					)}
					{section === "settings" && (
						<SettingsPage
							onBusy={onBusy}
							onAppearanceChange={applyAppearanceFromSettings}
						/>
					)}
					{section === "logger" && <LoggerPage />}
					{section === "about" && <AboutPage />}
				</main>
			</div>
			<BusyOverlay visible={busy} message={busyMessage} />

			{shortcutsOpen ? (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
					role="dialog"
					aria-modal="true"
				>
					<div className="w-full max-w-md rounded-2xl border border-ud-border bg-ud-elevated p-5 shadow-2xl">
						<div className="mb-3 flex items-center justify-between gap-2">
							<h3 className="text-base font-semibold">{t("Keyboard shortcuts")}</h3>
							<button
								type="button"
								onClick={() => setShortcutsOpen(false)}
								className="rounded-lg border border-ud-border px-2 py-1 text-xs hover:bg-ud-muted"
							>
								Esc
							</button>
						</div>
						<ul className="space-y-2 text-sm text-ud-text-muted">
							<li>
								<kbd className="rounded bg-ud-muted px-1.5 py-0.5 text-ud-text">1</kbd>{" "}
								{t("Courses")}
							</li>
							<li>
								<kbd className="rounded bg-ud-muted px-1.5 py-0.5 text-ud-text">2</kbd>{" "}
								{t("Library")}
							</li>
							<li>
								<kbd className="rounded bg-ud-muted px-1.5 py-0.5 text-ud-text">3</kbd> /{" "}
								<kbd className="rounded bg-ud-muted px-1.5 py-0.5 text-ud-text">D</kbd>{" "}
								{t("Dashboard")}
							</li>
							<li>
								<kbd className="rounded bg-ud-muted px-1.5 py-0.5 text-ud-text">4</kbd>{" "}
								{t("Settings")}
							</li>
							<li>
								<kbd className="rounded bg-ud-muted px-1.5 py-0.5 text-ud-text">5</kbd>{" "}
								{t("Logger")}
							</li>
							<li>
								<kbd className="rounded bg-ud-muted px-1.5 py-0.5 text-ud-text">?</kbd>{" "}
								{t("Show this help")}
							</li>
						</ul>
					</div>
				</div>
			) : null}
		</div>
	);
}

import { useCallback, useEffect, useState } from "react";
import type { NavSection, SessionUser } from "../shared/udeler.d.ts";
import { BusyOverlay } from "./components/BusyOverlay";
import { Sidebar } from "./components/Sidebar";
import { getUdeler } from "./hooks/useUdeler";
import { useI18n } from "./hooks/useI18n";
import { AboutPage } from "./pages/AboutPage";
import { CoursesPage } from "./pages/CoursesPage";
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

function applyThemeFromSettings() {
	const api = getUdeler();
	const theme = api?.settings.getSnapshot().theme === "light" ? "light" : "dark";
	document.documentElement.classList.toggle("dark", theme === "dark");
	document.documentElement.classList.toggle("light", theme === "light");
	document.documentElement.setAttribute("data-theme", theme);
}

export default function App() {
	const { t } = useI18n();
	const [view, setView] = useState<AppView>("boot");
	const [section, setSection] = useState<NavSection>("courses");
	const [user, setUser] = useState<SessionUser | null>(null);
	const [busy, setBusy] = useState(false);
	const [busyMessage, setBusyMessage] = useState<string | undefined>();
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
		applyThemeFromSettings();
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

		return () => {
			cancelled = true;
			unsubSave();
		};
	}, [onBusy, refreshQueue, t]);

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
	};

	if (view === "boot") {
		return <BusyOverlay visible message={t("Loading")} />;
	}

	if (view === "login") {
		return (
			<>
				<LoginPage onLoggedIn={handleLoggedIn} onBusy={onBusy} />
				<BusyOverlay visible={busy} message={busyMessage} />
			</>
		);
	}

	return (
		<div className="flex h-full min-h-0 bg-ud-bg text-ud-text">
			<Sidebar
				active={section}
				user={user}
				queue={queue}
				onNavigate={setSection}
				onLogout={handleLogout}
			/>
			<main className="min-h-0 flex-1 overflow-y-auto p-5 md:p-8">
				{section === "courses" && (
					<CoursesPage onBusy={onBusy} onQueueChange={refreshQueue} />
				)}
				{section === "library" && <LibraryPage onBusy={onBusy} />}
				{section === "settings" && <SettingsPage onBusy={onBusy} />}
				{section === "logger" && <LoggerPage />}
				{section === "about" && <AboutPage />}
			</main>
			<BusyOverlay visible={busy} message={busyMessage} />
		</div>
	);
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { getUdeler } from "../hooks/useUdeler";

interface LogEntry {
	title: string;
	detail: string;
	at: string;
	level?: string;
	category?: string;
}

type LogLevelFilter = "all" | "error" | "warning" | "info";
type LogCategoryFilter = "all" | "error" | "drm" | "remux" | "general";

export function LoggerPage() {
	const { t } = useI18n();
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [level, setLevel] = useState<LogLevelFilter>("all");
	const [category, setCategory] = useState<LogCategoryFilter>("all");
	const [query, setQuery] = useState("");
	const [message, setMessage] = useState("");

	const refresh = useCallback(() => {
		const api = getUdeler();
		if (!api) return;
		setLogs(
			api.logs.list({
				level,
				category,
				query,
			})
		);
	}, [level, category, query]);

	useEffect(() => {
		refresh();
		const timer = window.setInterval(refresh, 2000);
		return () => window.clearInterval(timer);
	}, [refresh]);

	const clear = () => {
		getUdeler()?.logs.clear();
		setLogs([]);
	};

	const exportLogs = async () => {
		const api = getUdeler();
		if (!api?.logs.export) return;
		const result = await api.logs.export();
		if (result.ok) {
			setMessage(`${t("Log exported")}: ${result.path}`);
		} else if (!result.canceled) {
			setMessage(t("Export failed"));
		}
	};

	const counts = useMemo(() => {
		const api = getUdeler();
		const all = api?.logs.list({}) || [];
		return {
			error: all.filter((e) => e.level === "error").length,
			warning: all.filter((e) => e.level === "warning").length,
			drm: all.filter((e) => e.category === "drm").length,
			remux: all.filter((e) => e.category === "remux").length,
		};
	}, [logs]);

	const levelClass = (entryLevel?: string) => {
		if (entryLevel === "error") return "text-ud-danger";
		if (entryLevel === "warning") return "text-ud-warning";
		return "text-ud-text";
	};

	return (
		<div className="flex h-full min-h-0 flex-col space-y-4">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold">{t("Logger")}</h2>
					<p className="mt-1 text-sm text-ud-text-muted">{t("Application logs")}</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={refresh}
						className="rounded-lg border border-ud-border px-3 py-1.5 text-sm hover:bg-ud-muted"
					>
						{t("Refresh")}
					</button>
					<button
						type="button"
						onClick={() => void exportLogs()}
						className="rounded-lg border border-ud-border px-3 py-1.5 text-sm hover:bg-ud-muted"
					>
						{t("Export log")}
					</button>
					<button
						type="button"
						onClick={clear}
						className="rounded-lg border border-ud-danger/40 px-3 py-1.5 text-sm text-ud-danger hover:bg-ud-danger/10"
					>
						{t("Clear")}
					</button>
				</div>
			</header>

			<div className="flex flex-wrap items-center gap-2">
				<input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder={t("Search logs")}
					className="min-w-[12rem] flex-1 rounded-lg border border-ud-border bg-ud-elevated px-3 py-1.5 text-sm outline-none focus:border-ud-accent"
				/>
				<select
					value={level}
					onChange={(e) => setLevel(e.target.value as LogLevelFilter)}
					className="rounded-lg border border-ud-border bg-ud-elevated px-3 py-1.5 text-sm"
					aria-label={t("Level")}
				>
					<option value="all">{t("All levels")}</option>
					<option value="error">
						{t("Errors")} ({counts.error})
					</option>
					<option value="warning">
						{t("Warnings")} ({counts.warning})
					</option>
					<option value="info">{t("Info")}</option>
				</select>
				<select
					value={category}
					onChange={(e) => setCategory(e.target.value as LogCategoryFilter)}
					className="rounded-lg border border-ud-border bg-ud-elevated px-3 py-1.5 text-sm"
					aria-label={t("Category")}
				>
					<option value="all">{t("All categories")}</option>
					<option value="error">{t("Errors")}</option>
					<option value="drm">
						DRM ({counts.drm})
					</option>
					<option value="remux">
						Remux ({counts.remux})
					</option>
					<option value="general">{t("General")}</option>
				</select>
			</div>

			{message ? <p className="text-sm text-ud-warning">{message}</p> : null}

			<div className="min-h-0 flex-1 overflow-auto rounded-xl border border-ud-border bg-ud-elevated">
				{logs.length === 0 ? (
					<p className="px-4 py-10 text-center text-sm text-ud-text-muted">
						{t("No logs yet")}
					</p>
				) : (
					<ul className="divide-y divide-ud-border">
						{logs.map((entry, index) => (
							<li key={`${entry.at}-${index}`} className="px-4 py-3">
								<div className="flex flex-wrap items-baseline justify-between gap-2">
									<p className={`text-sm font-medium ${levelClass(entry.level)}`}>
										<span className="mr-2 rounded bg-ud-muted px-1.5 py-0.5 text-[10px] uppercase text-ud-text-muted">
											{entry.category || "general"}
										</span>
										{entry.title}
									</p>
									<time className="text-[11px] text-ud-text-muted">{entry.at}</time>
								</div>
								{entry.detail && (
									<pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs text-ud-text-muted">
										{entry.detail}
									</pre>
								)}
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { getUdeler } from "../hooks/useUdeler";

interface LogEntry {
	title: string;
	detail: string;
	at: string;
}

export function LoggerPage() {
	const { t } = useI18n();
	const [logs, setLogs] = useState<LogEntry[]>([]);

	const refresh = useCallback(() => {
		const api = getUdeler();
		if (!api) return;
		setLogs(api.logs.list());
	}, []);

	useEffect(() => {
		refresh();
		const timer = window.setInterval(refresh, 2000);
		return () => window.clearInterval(timer);
	}, [refresh]);

	const clear = () => {
		getUdeler()?.logs.clear();
		setLogs([]);
	};

	return (
		<div className="flex h-full min-h-0 flex-col space-y-4">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold">{t("Logger")}</h2>
					<p className="mt-1 text-sm text-ud-text-muted">{t("Application logs")}</p>
				</div>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={refresh}
						className="rounded-lg border border-ud-border px-3 py-1.5 text-sm hover:bg-ud-muted"
					>
						{t("Refresh")}
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
									<p className="text-sm font-medium text-ud-text">{entry.title}</p>
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

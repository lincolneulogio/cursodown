import { useCallback, useEffect, useState } from "react";
import type { IntegrityReport, LibraryListItem } from "../../shared/udeler.d.ts";
import { MediaPlayerModal } from "../components/MediaPlayerModal";
import { useI18n } from "../hooks/useI18n";
import { getUdeler } from "../hooks/useUdeler";

interface LibraryPageProps {
	onBusy: (busy: boolean, message?: string) => void;
}

function formatDate(iso: string | null, localeHint: string): string {
	if (!iso) return "—";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	try {
		return date.toLocaleString(localeHint === "Español" ? "es" : undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		});
	} catch {
		return date.toLocaleString();
	}
}

export function LibraryPage({ onBusy }: LibraryPageProps) {
	const { t } = useI18n();
	const [items, setItems] = useState<LibraryListItem[]>([]);
	const [reports, setReports] = useState<Record<string, IntegrityReport>>({});
	const [message, setMessage] = useState("");
	const [playerOpen, setPlayerOpen] = useState(false);
	const [playerFolder, setPlayerFolder] = useState("");
	const [playerName, setPlayerName] = useState("");

	const refresh = useCallback(() => {
		const api = getUdeler();
		if (!api) return;
		onBusy(true, t("Loading"));
		setMessage("");
		try {
			setItems(api.library.list({ scanIntegrity: true }));
		} finally {
			onBusy(false);
		}
	}, [onBusy, t]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const openPath = async (target: string) => {
		const api = getUdeler();
		if (!api || !target) return;
		await api.shell.openPath(target);
	};

	const removeItem = (item: LibraryListItem) => {
		const api = getUdeler();
		if (!api) return;
		const ok = api.library.remove(item.id, item.path);
		if (ok) {
			setItems((prev) => prev.filter((x) => x.id !== item.id));
			setReports((prev) => {
				const next = { ...prev };
				delete next[item.id];
				return next;
			});
		}
	};

	const playItem = (item: LibraryListItem) => {
		if (!item.exists || !item.path) return;
		setPlayerFolder(item.path);
		setPlayerName(item.name);
		setPlayerOpen(true);
	};

	const exportIndex = (item: LibraryListItem) => {
		const api = getUdeler();
		if (!api || !item.path || !item.exists) return;
		onBusy(true, t("Exporting index"));
		try {
			const result = api.library.exportIndex(item.path, { name: item.name });
			setMessage(
				`${t("Index exported")}: ${result.files.map((f) => f.split(/[/\\]/).pop()).join(", ")}`
			);
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			api.dialog.showErrorBox(t("Error"), detail);
		} finally {
			onBusy(false);
		}
	};

	const verifyItem = (item: LibraryListItem) => {
		const api = getUdeler();
		if (!api || !item.path) return;
		onBusy(true, t("Verifying integrity"));
		try {
			const report = api.library.verify(item.path);
			setReports((prev) => ({ ...prev, [item.id]: report }));
			setItems((prev) =>
				prev.map((row) =>
					row.id === item.id
						? {
								...row,
								brokenCount: report.broken,
								okMediaCount: report.ok,
								sizeBytes: report.totalSizeBytes || row.sizeBytes,
							}
						: row
				)
			);
			setMessage(
				report.broken > 0
					? `${item.name}: ${report.broken} ${t("Broken lessons")}`
					: `${item.name}: ${t("Integrity OK")}`
			);
		} finally {
			onBusy(false);
		}
	};

	const retryBroken = async (item: LibraryListItem) => {
		const api = getUdeler();
		if (!api) return;
		if (item.id.startsWith("folder:")) {
			api.dialog.showErrorBox(
				t("Error"),
				t("Retry requires a course linked to your Udemy account")
			);
			return;
		}
		onBusy(true, t("Retrying failed lessons"));
		setMessage("");
		try {
			const result = await api.downloads.retryBroken(item.id, {
				name: item.name,
				path: item.path,
				image: item.image,
			});
			if (result.count === 0) {
				setMessage(t("No broken lessons to retry"));
			} else {
				setMessage(`${t("Retrying failed lessons")}: ${result.count}`);
			}
			refresh();
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			api.dialog.showErrorBox(t("Error"), detail);
			api.logs.append("retryBroken failed", detail);
		} finally {
			onBusy(false);
		}
	};

	const api = getUdeler();
	const language = api?.i18n.getLanguage() || "Español";

	return (
		<div className="space-y-5">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold">{t("Library")}</h2>
					<p className="mt-1 text-sm text-ud-text-muted">
						{t("Courses already saved on this computer")}
					</p>
				</div>
				<button
					type="button"
					onClick={refresh}
					className="rounded-lg border border-ud-border px-3 py-1.5 text-sm hover:bg-ud-muted"
				>
					{t("Refresh")}
				</button>
			</header>

			{message ? <p className="text-sm text-ud-warning">{message}</p> : null}

			{items.length === 0 ? (
				<p className="rounded-xl border border-dashed border-ud-border px-4 py-10 text-center text-sm text-ud-text-muted">
					{t("No Courses Found")}
				</p>
			) : (
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{items.map((item) => {
						const report = reports[item.id];
						const broken = report?.broken ?? item.brokenCount;
						const sizeLabel = api?.library.formatSize(item.sizeBytes || 0) || "—";
						return (
							<article
								key={item.id}
								className="overflow-hidden rounded-xl border border-ud-border bg-ud-elevated"
							>
								<div className="aspect-video bg-ud-muted">
									{item.image ? (
										<img src={item.image} alt="" className="h-full w-full object-cover" />
									) : null}
								</div>
								<div className="space-y-2 p-3">
									<h3 className="truncate text-sm font-medium" title={item.name}>
										{item.name}
									</h3>
									<p className="text-xs text-ud-text-muted">
										{item.completed ? t("Completed") : t("Incomplete")}
										{item.encryptedVideos > 0 ? " · DRM" : ""}
										{!item.exists ? ` · ${t("Missing folder")}` : ""}
									</p>
									<p className="text-xs text-ud-text-muted">
										{t("Size")}: {sizeLabel}
										{" · "}
										{t("Date")}: {formatDate(item.downloadedAt, language)}
									</p>
									<p className="text-xs text-ud-text-muted">
										{t("Playable")}: {report?.ok ?? item.okMediaCount}
										{broken > 0 ? (
											<span className="text-ud-danger">
												{" · "}
												{broken} {t("Broken")}
											</span>
										) : null}
									</p>
									<div className="flex flex-wrap gap-2">
										<button
											type="button"
											disabled={!item.exists}
											onClick={() => playItem(item)}
											className="rounded-lg bg-ud-accent px-2.5 py-1 text-xs text-white hover:bg-ud-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
										>
											{t("Play")}
										</button>
										<button
											type="button"
											disabled={!item.exists}
											onClick={() => void openPath(item.path)}
											className="rounded-lg border border-ud-border px-2.5 py-1 text-xs hover:bg-ud-muted disabled:cursor-not-allowed disabled:opacity-40"
										>
											{t("Open folder")}
										</button>
										<button
											type="button"
											disabled={!item.exists}
											onClick={() => exportIndex(item)}
											className="rounded-lg border border-ud-border px-2.5 py-1 text-xs hover:bg-ud-muted disabled:cursor-not-allowed disabled:opacity-40"
										>
											{t("Export index")}
										</button>
										<button
											type="button"
											disabled={!item.exists}
											onClick={() => verifyItem(item)}
											className="rounded-lg border border-ud-border px-2.5 py-1 text-xs hover:bg-ud-muted disabled:cursor-not-allowed disabled:opacity-40"
										>
											{t("Verify integrity")}
										</button>
										{broken > 0 ? (
											<button
												type="button"
												onClick={() => void retryBroken(item)}
												className="rounded-lg border border-ud-warning/50 px-2.5 py-1 text-xs text-ud-warning hover:bg-ud-warning/10"
											>
												{t("Retry failed")}
											</button>
										) : null}
										<button
											type="button"
											onClick={() => removeItem(item)}
											className="rounded-lg border border-ud-danger/40 px-2.5 py-1 text-xs text-ud-danger hover:bg-ud-danger/10"
										>
											{t("Remove")}
										</button>
									</div>
								</div>
							</article>
						);
					})}
				</div>
			)}

			<MediaPlayerModal
				open={playerOpen}
				folderPath={playerFolder}
				courseName={playerName}
				onClose={() => setPlayerOpen(false)}
			/>
		</div>
	);
}

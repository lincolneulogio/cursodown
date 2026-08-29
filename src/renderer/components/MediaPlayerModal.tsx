import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { getUdeler } from "../hooks/useUdeler";

export interface MediaItem {
	path: string;
	name: string;
	url: string;
	sizeBytes: number;
	ok: boolean;
}

interface MediaPlayerModalProps {
	open: boolean;
	folderPath: string;
	courseName?: string;
	initialPath?: string;
	onClose: () => void;
}

function formatBytes(bytes: number): string {
	const api = getUdeler();
	if (api?.library.formatSize) return api.library.formatSize(bytes);
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let size = bytes;
	let i = -1;
	do {
		size /= 1024;
		i += 1;
	} while (size >= 1024 && i < units.length - 1);
	return `${size.toFixed(1)} ${units[i]}`;
}

export function MediaPlayerModal({
	open,
	folderPath,
	courseName,
	initialPath,
	onClose,
}: MediaPlayerModalProps) {
	const { t } = useI18n();
	const [items, setItems] = useState<MediaItem[]>([]);
	const [currentPath, setCurrentPath] = useState<string>("");
	const [query, setQuery] = useState("");

	useEffect(() => {
		if (!open || !folderPath) return;
		const api = getUdeler();
		if (!api) return;
		const list = api.media.listInFolder(folderPath);
		setItems(list);
		const preferred =
			(initialPath && list.find((item) => item.path === initialPath)?.path) ||
			list[0]?.path ||
			"";
		setCurrentPath(preferred);
		setQuery("");
	}, [open, folderPath, initialPath]);

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return items;
		return items.filter((item) => item.name.toLowerCase().includes(q));
	}, [items, query]);

	const current = items.find((item) => item.path === currentPath) || filtered[0] || null;

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 md:p-6"
			role="dialog"
			aria-modal="true"
			aria-labelledby="player-title"
		>
			<div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-ud-border bg-ud-elevated shadow-2xl">
				<header className="flex items-start justify-between gap-3 border-b border-ud-border px-4 py-3">
					<div className="min-w-0">
						<h3 id="player-title" className="truncate text-base font-semibold">
							{courseName || t("Player")}
						</h3>
						<p className="mt-0.5 truncate text-xs text-ud-text-muted">
							{current?.name || t("No playable videos")}
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg border border-ud-border px-3 py-1.5 text-sm hover:bg-ud-muted"
					>
						{t("Close")}
					</button>
				</header>

				<div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_16rem]">
					<div className="flex min-h-0 flex-col bg-black">
						{current ? (
							<video
								key={current.path}
								className="max-h-[60vh] w-full flex-1 bg-black object-contain md:max-h-[70vh]"
								controls
								autoPlay
								src={current.url}
							>
								{t("Video not supported")}
							</video>
						) : (
							<div className="flex flex-1 items-center justify-center px-4 py-16 text-sm text-ud-text-muted">
								{t("No playable videos")}
							</div>
						)}
					</div>

					<aside className="flex min-h-0 flex-col border-t border-ud-border md:border-l md:border-t-0">
						<div className="border-b border-ud-border p-2">
							<input
								type="search"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder={t("Search lessons")}
								className="w-full rounded-lg border border-ud-border bg-ud-muted px-2.5 py-1.5 text-xs outline-none focus:border-ud-accent"
							/>
						</div>
						<ul className="min-h-0 flex-1 overflow-y-auto">
							{filtered.length === 0 ? (
								<li className="px-3 py-6 text-center text-xs text-ud-text-muted">
									{t("No playable videos")}
								</li>
							) : (
								filtered.map((item) => {
									const active = item.path === current?.path;
									return (
										<li key={item.path}>
											<button
												type="button"
												onClick={() => setCurrentPath(item.path)}
												className={[
													"flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs transition-colors",
													active
														? "bg-ud-accent/20 text-ud-accent-hover"
														: "hover:bg-ud-muted",
												].join(" ")}
											>
												<span className="line-clamp-2 font-medium">{item.name}</span>
												<span className="text-[10px] text-ud-text-muted">
													{formatBytes(item.sizeBytes)}
												</span>
											</button>
										</li>
									);
								})
							)}
						</ul>
					</aside>
				</div>
			</div>
		</div>
	);
}

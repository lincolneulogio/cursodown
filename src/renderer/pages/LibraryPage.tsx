import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { getUdeler } from "../hooks/useUdeler";

interface LibraryItem {
	id: string;
	name: string;
	path: string;
	completed: boolean;
	encryptedVideos: number;
	image: string;
	exists: boolean;
	modifiedAt: number;
}

interface LibraryPageProps {
	onBusy: (busy: boolean, message?: string) => void;
}

export function LibraryPage({ onBusy }: LibraryPageProps) {
	const { t } = useI18n();
	const [items, setItems] = useState<LibraryItem[]>([]);

	const refresh = useCallback(() => {
		const api = getUdeler();
		if (!api) return;
		onBusy(true, t("Loading"));
		try {
			setItems(api.library.list());
		} finally {
			onBusy(false);
		}
	}, [onBusy, t]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const openPath = async (path: string) => {
		const api = getUdeler();
		if (!api) return;
		await api.shell.openPath(path);
	};

	const removeItem = (item: LibraryItem) => {
		const api = getUdeler();
		if (!api) return;
		const ok = api.library.remove(item.id, item.path);
		if (ok) {
			setItems((prev) => prev.filter((x) => x.id !== item.id));
		}
	};

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

			{items.length === 0 ? (
				<p className="rounded-xl border border-dashed border-ud-border px-4 py-10 text-center text-sm text-ud-text-muted">
					{t("No Courses Found")}
				</p>
			) : (
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{items.map((item) => (
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
								<h3 className="truncate text-sm font-medium">{item.name}</h3>
								<p className="text-xs text-ud-text-muted">
									{item.completed ? t("Completed") : t("Incomplete")}
									{item.encryptedVideos > 0 ? " · DRM" : ""}
									{!item.exists ? ` · ${t("Missing folder")}` : ""}
								</p>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={() => void openPath(item.path)}
										className="rounded-lg bg-ud-accent px-2.5 py-1 text-xs text-white hover:bg-ud-accent-hover"
									>
										{t("Open")}
									</button>
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
					))}
				</div>
			)}
		</div>
	);
}

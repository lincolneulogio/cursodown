import {
	IconAlertTriangle,
	IconCheck,
	IconFolderOpen,
	IconRefresh,
	IconTrash,
	IconFileExport,
	IconShieldCheck,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { IntegrityReport, LibraryListItem } from "../../shared/udeler.d.ts";
import { useI18n } from "../hooks/useI18n";
import { getUdeler } from "../hooks/useUdeler";

interface LibraryPageProps {
	onBusy: (busy: boolean, message?: string) => void;
}

interface CatalogCourse {
	id: string;
	title: string;
	image: string;
	instructor: string;
	duration: string;
	lectureCount: number;
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

function norm(value: string): string {
	return String(value || "")
		.toLowerCase()
		.trim()
		.replace(/\s+/g, " ");
}

function ActionButton({
	children,
	onClick,
	disabled,
	variant = "default",
	icon,
	block = false,
	className = "",
}: {
	children: ReactNode;
	onClick: () => void;
	disabled?: boolean;
	variant?: "default" | "primary" | "danger" | "warning";
	icon?: ReactNode;
	block?: boolean;
	className?: string;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={[
				"ud-lib-btn",
				`ud-lib-btn--${variant}`,
				block ? "ud-lib-btn--block" : "",
				className,
			]
				.filter(Boolean)
				.join(" ")}
		>
			{icon}
			<span>{children}</span>
		</button>
	);
}

function MetaChip({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 rounded-xl bg-ud-muted px-3 py-2">
			<p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ud-text-muted">
				{label}
			</p>
			<p className="mt-0.5 truncate text-sm font-semibold text-ud-text" title={value}>
				{value}
			</p>
		</div>
	);
}

function StatusBadge({
	tone,
	children,
}: {
	tone: "ok" | "muted" | "danger" | "warn";
	children: ReactNode;
}) {
	const toneClass =
		tone === "ok"
			? "bg-emerald-700 text-white"
			: tone === "danger"
				? "bg-red-600 text-white"
				: tone === "warn"
					? "bg-amber-500 text-black"
					: "bg-zinc-900 text-white";
	return (
		<span
			className={[
				"rounded-lg px-2.5 py-1 text-[11px] font-bold tracking-wide",
				toneClass,
			].join(" ")}
		>
			{children}
		</span>
	);
}

function parseCatalog(payload: unknown): CatalogCourse[] {
	if (!payload || typeof payload !== "object") return [];
	const results = Array.isArray((payload as { results?: unknown[] }).results)
		? ((payload as { results: unknown[] }).results as Array<Record<string, unknown>>)
		: [];

	return results
		.map((raw) => {
			const nested =
				raw && typeof raw === "object" && raw.course && typeof raw.course === "object"
					? { ...raw, ...(raw.course as Record<string, unknown>) }
					: raw;
			const title = String(nested.title || nested.name || nested.published_title || "").trim();
			const image = String(
				nested.image || nested.image_480x270 || nested.image_240x135 || ""
			).trim();
			const instructorRaw = nested.visible_instructors;
			const instructor =
				Array.isArray(instructorRaw) &&
				instructorRaw[0] &&
				typeof instructorRaw[0] === "object"
					? String(
							(instructorRaw[0] as { display_name?: string; title?: string; name?: string })
								.display_name ||
								(instructorRaw[0] as { title?: string }).title ||
								(instructorRaw[0] as { name?: string }).name ||
								""
						).trim()
					: "";
			const lectureCount = Number(
				nested.num_lectures || nested.num_published_lectures || nested.lectureCount || 0
			);
			const duration = String(nested.content_info || nested.duration || "").trim();
			return {
				id: String(nested.id ?? ""),
				title,
				image,
				instructor,
				duration,
				lectureCount: Number.isFinite(lectureCount) ? lectureCount : 0,
			};
		})
		.filter((c) => c.id || c.title);
}

function matchCatalogCourse(item: LibraryListItem, catalog: CatalogCourse[]): CatalogCourse | null {
	const name = norm(item.name);
	const pathParts = String(item.path || "")
		.split(/[/\\]/)
		.filter(Boolean)
		.map(norm);
	const base = pathParts[pathParts.length - 1] || "";
	const parent = pathParts[pathParts.length - 2] || "";

	const byId = catalog.find((c) => c.id && c.id === String(item.id));
	if (byId) return byId;

	const byExactTitle = catalog.find((c) => c.title && (norm(c.title) === name || norm(c.title) === base));
	if (byExactTitle) return byExactTitle;

	const byTitleInPath = catalog.find(
		(c) => c.title && pathParts.some((part) => part.includes(norm(c.title)) || norm(c.title).includes(part))
	);
	if (byTitleInPath) return byTitleInPath;

	const byInstructorAndPath = catalog.find(
		(c) =>
			c.instructor &&
			(norm(c.instructor) === name || norm(c.instructor) === parent || norm(c.instructor) === base) &&
			c.title &&
			pathParts.some((part) => part.includes(norm(c.title).slice(0, 18)))
	);
	if (byInstructorAndPath) return byInstructorAndPath;

	const instructorMatches = catalog.filter(
		(c) => c.instructor && (norm(c.instructor) === name || norm(c.instructor) === parent)
	);
	if (instructorMatches.length === 1) return instructorMatches[0];
	if (instructorMatches.length > 1) {
		const scored = instructorMatches
			.map((c) => {
				const titleNorm = norm(c.title);
				const score = pathParts.reduce(
					(acc, part) => acc + (titleNorm && (part.includes(titleNorm) || titleNorm.includes(part)) ? 3 : 0),
					c.image ? 1 : 0
				);
				return { c, score };
			})
			.sort((a, b) => b.score - a.score);
		if (scored[0]?.score > 0) return scored[0].c;
		return scored[0]?.c || null;
	}

	return null;
}

export function LibraryPage({ onBusy }: LibraryPageProps) {
	const { t } = useI18n();
	const [items, setItems] = useState<LibraryListItem[]>([]);
	const [reports, setReports] = useState<Record<string, IntegrityReport>>({});
	const [message, setMessage] = useState("");
	const [brokenCovers, setBrokenCovers] = useState<Record<string, boolean>>({});

	const refresh = useCallback(async () => {
		const api = getUdeler();
		if (!api) return;
		onBusy(true, t("Loading"));
		setMessage("");
		try {
			let next = api.library.list({ scanIntegrity: true });

			const applyMatch = (item: LibraryListItem, match: CatalogCourse | null): LibraryListItem => {
				if (!match) return item;
				const lectureCount =
					match.lectureCount > 0 ? match.lectureCount : item.lectureCount;
				const enriched: LibraryListItem = {
					...item,
					id: item.id.startsWith("folder:") && match.id ? match.id : item.id,
					name: match.title || item.name,
					image: match.image || item.image,
					instructor: match.instructor || item.instructor,
					duration: match.duration || item.duration,
					lectureCount,
				};
				if (enriched.path && enriched.exists) {
					try {
						api.library.writeMeta?.(enriched.path, {
							id: enriched.id,
							name: enriched.name,
							image: enriched.image,
							instructor: enriched.instructor,
							duration: enriched.duration,
							lectureCount: enriched.lectureCount,
						});
					} catch (_error) {
						// Meta persist is best-effort.
					}
				}
				return enriched;
			};

			try {
				const payload = await api.courses.fetch(200);
				const catalog = parseCatalog(payload);
				if (catalog.length > 0) {
					next = next.map((item) => applyMatch(item, matchCatalogCourse(item, catalog)));
				}

				// Courses outside the first page: search by title to get num_lectures.
				const missing = next.filter((item) => !item.lectureCount || item.lectureCount <= 0);
				for (const item of missing.slice(0, 12)) {
					const keyword = String(item.name || "")
						.split(/[:\-–|]/)[0]
						.trim()
						.slice(0, 48);
					if (keyword.length < 3) continue;
					try {
						const searchPayload = await api.courses.search(keyword, 15);
						const searchCatalog = parseCatalog(searchPayload);
						const match =
							matchCatalogCourse(item, searchCatalog) ||
							searchCatalog.find((c) => norm(c.title) === norm(item.name)) ||
							null;
						if (match?.lectureCount && match.lectureCount > 0) {
							next = next.map((row) =>
								row.id === item.id && row.path === item.path ? applyMatch(row, match) : row
							);
						}
					} catch (_error) {
						// Search enrich is best-effort.
					}
				}
			} catch (_error) {
				// Catalog enrich is best-effort.
			}

			const downloaded = api.downloads.getDownloadedCourses?.() || [];
			next = next.map((item) => {
				if (item.image && item.duration && item.lectureCount) return item;
				const fromDl = downloaded.find((course) => {
					if (String(course.id) === String(item.id)) return true;
					const title = String(course.title || "");
					return Boolean(title && norm(title) === norm(item.name));
				});
				if (!fromDl) return item;
				const lectureCount = Number(fromDl.lectureCount || 0);
				return {
					...item,
					name: String(fromDl.title || item.name),
					image: String(fromDl.image || item.image || ""),
					instructor: String(fromDl.instructor || item.instructor || ""),
					duration: String(fromDl.duration || item.duration || ""),
					lectureCount:
						item.lectureCount && item.lectureCount > 0
							? item.lectureCount
							: Number.isFinite(lectureCount) && lectureCount > 0
								? lectureCount
								: item.lectureCount,
				};
			});

			setItems(next);
			setBrokenCovers({});
		} finally {
			onBusy(false);
		}
	}, [onBusy, t]);

	useEffect(() => {
		void refresh();
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
			void refresh();
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
		<div className="space-y-6">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-2xl font-semibold tracking-tight text-[var(--ud-text)]">
						{t("Library")}
					</h2>
					<p className="mt-1 text-sm text-[var(--ud-text-muted)]">
						{t("Courses already saved on this computer")}
					</p>
				</div>
				<button
					type="button"
					onClick={() => void refresh()}
					className="inline-flex items-center gap-2 rounded-xl border border-[var(--ud-border)] bg-[var(--ud-bg-elevated)] px-3.5 py-2 text-sm font-semibold text-[var(--ud-text)] transition-colors hover:border-[var(--ud-accent)] hover:bg-[var(--ud-bg-muted)]"
				>
					<IconRefresh size={16} stroke={1.75} />
					{t("Refresh")}
				</button>
			</header>

			{message ? (
				<div className="flex items-start gap-3 rounded-2xl border border-emerald-600/30 bg-emerald-600/10 px-4 py-3">
					<span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
						<IconCheck size={15} stroke={2.5} />
					</span>
					<p className="min-w-0 flex-1 text-sm font-medium leading-relaxed text-[var(--ud-text)]">
						{message}
					</p>
					<button
						type="button"
						onClick={() => setMessage("")}
						className="shrink-0 rounded-lg bg-[var(--ud-bg-elevated)] px-3 py-1.5 text-xs font-bold text-[var(--ud-text)] ring-1 ring-[var(--ud-border)] transition-colors hover:bg-[var(--ud-bg-muted)]"
					>
						OK
					</button>
				</div>
			) : null}

			{items.length === 0 ? (
				<div className="rounded-2xl border border-dashed border-[var(--ud-border)] bg-[var(--ud-bg-elevated)] px-4 py-16 text-center">
					<p className="text-sm text-[var(--ud-text-muted)]">{t("No Courses Found")}</p>
				</div>
			) : (
				<div className="grid gap-5 grid-cols-1 md:grid-cols-3">
					{items.map((item) => {
						const report = reports[item.id];
						const broken = report?.broken ?? item.brokenCount;
						const sizeLabel = api?.library.formatSize(item.sizeBytes || 0) || "—";
						const showImage = Boolean(item.image) && !brokenCovers[item.id];
						const classesValue =
							item.lectureCount && item.lectureCount > 0
								? String(item.lectureCount)
								: "—";

						return (
							<article
								key={`${item.id}:${item.path}`}
								className="flex flex-col overflow-hidden rounded-2xl border border-[var(--ud-border)] bg-[var(--ud-bg-elevated)]"
							>
								<div className="relative aspect-[16/10] overflow-hidden bg-[var(--ud-bg-muted)]">
									{showImage ? (
										<img
											src={item.image}
											alt=""
											loading="lazy"
											decoding="async"
											referrerPolicy="no-referrer"
											className="h-full w-full object-cover"
											onError={() =>
												setBrokenCovers((prev) => ({ ...prev, [item.id]: true }))
											}
										/>
									) : (
										<div className="flex h-full items-center justify-center px-4 text-center text-xs text-[var(--ud-text-muted)]">
											{t("No image")}
										</div>
									)}
									<div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
									<div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
										<StatusBadge tone={item.completed ? "ok" : "muted"}>
											{item.completed ? t("Completed") : t("Incomplete")}
										</StatusBadge>
										{item.encryptedVideos > 0 ? (
											<StatusBadge tone="danger">DRM</StatusBadge>
										) : null}
										{!item.exists ? (
											<StatusBadge tone="warn">{t("Missing folder")}</StatusBadge>
										) : null}
									</div>
								</div>

								<div className="flex flex-1 flex-col gap-3.5 p-4">
									<div className="space-y-1">
										<h3
											className="line-clamp-2 text-base font-semibold leading-snug text-[var(--ud-text)]"
											title={item.name}
										>
											{item.name}
										</h3>
										{item.instructor ? (
											<p className="truncate text-sm text-[var(--ud-text-muted)]">
												{item.instructor}
											</p>
										) : null}
									</div>

									<div className="grid grid-cols-2 gap-2">
										<MetaChip label={t("Size")} value={sizeLabel} />
										<MetaChip label={t("Duration")} value={item.duration || "—"} />
										<MetaChip label={t("Classes")} value={classesValue} />
										<MetaChip
											label={t("Date")}
											value={formatDate(item.downloadedAt, language)}
										/>
									</div>

									{broken > 0 ? (
										<p className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
											<IconAlertTriangle size={14} stroke={1.75} />
											{broken} {t("Broken")}
										</p>
									) : null}

									<div className="mt-auto space-y-2 border-t border-[var(--ud-border)]/60 pt-3.5">
										<ActionButton
											variant="primary"
											block
											disabled={!item.exists}
											icon={<IconFolderOpen size={15} stroke={1.75} />}
											onClick={() => void openPath(item.path)}
										>
											{t("Open folder")}
										</ActionButton>
										<div className="grid grid-cols-2 gap-2">
											<ActionButton
												block
												disabled={!item.exists}
												icon={<IconFileExport size={15} stroke={1.75} />}
												onClick={() => exportIndex(item)}
											>
												{t("Export index")}
											</ActionButton>
											<ActionButton
												block
												disabled={!item.exists}
												icon={<IconShieldCheck size={15} stroke={1.75} />}
												onClick={() => verifyItem(item)}
											>
												{t("Verify integrity")}
											</ActionButton>
										</div>
										<div className="grid grid-cols-2 gap-2">
											{broken > 0 ? (
												<ActionButton
													variant="warning"
													block
													icon={<IconAlertTriangle size={15} stroke={1.75} />}
													onClick={() => void retryBroken(item)}
												>
													{t("Retry failed")}
												</ActionButton>
											) : null}
											<ActionButton
												variant="danger"
												block
												icon={<IconTrash size={15} stroke={1.75} />}
												onClick={() => removeItem(item)}
												className={broken > 0 ? "" : "col-span-2"}
											>
												{t("Remove")}
											</ActionButton>
										</div>
									</div>
								</div>
							</article>
						);
					})}
				</div>
			)}
		</div>
	);
}

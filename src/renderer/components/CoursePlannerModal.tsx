import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { getUdeler } from "../hooks/useUdeler";

export interface PlannerLecture {
	name: string;
	isEncrypted?: boolean;
	quality?: string;
	type?: string;
	duration?: string;
	durationSeconds?: number;
}

export interface PlannerChapter {
	name: string;
	lectures: PlannerLecture[];
}

export interface PlannerCourseData {
	name?: string;
	chapters?: PlannerChapter[];
	[key: string]: unknown;
}

interface CoursePlannerModalProps {
	open: boolean;
	courseData: PlannerCourseData | null;
	/** Local folder used to detect missing/broken lectures. */
	coursePath?: string;
	onCancel: () => void;
	onConfirm: (filtered: unknown, selectedKeys: string[]) => void;
}

function lectureKey(chapterIndex: number, lectureIndex: number): string {
	return `${chapterIndex}:${lectureIndex}`;
}

function isVideoLecture(lecture: PlannerLecture): boolean {
	const quality = String(lecture.quality || "").toLowerCase();
	const type = String(lecture.type || "").toLowerCase();
	if (
		quality === "article" ||
		quality === "attachment" ||
		type === "article" ||
		type === "file" ||
		type === "url"
	) {
		return Boolean(lecture.isEncrypted);
	}
	return true;
}

export function CoursePlannerModal({
	open,
	courseData,
	coursePath = "",
	onCancel,
	onConfirm,
}: CoursePlannerModalProps) {
	const { t } = useI18n();
	const chapters = courseData?.chapters ?? [];

	const defaultSelected = useMemo(() => {
		const api = getUdeler();
		if (api?.planner.selectKeys && courseData) {
			const mode = coursePath ? "missing" : "all";
			const keys = api.planner.selectKeys(courseData, mode, coursePath);
			if (keys.length > 0) return new Set(keys);
		}
		const keys = new Set<string>();
		chapters.forEach((chapter, ci) => {
			(chapter.lectures || []).forEach((lecture, li) => {
				if (!lecture.isEncrypted) {
					keys.add(lectureKey(ci, li));
				}
			});
		});
		return keys;
	}, [chapters, courseData, coursePath]);

	const [selected, setSelected] = useState<Set<string>>(defaultSelected);
	const [diskHint, setDiskHint] = useState("");
	const [query, setQuery] = useState("");

	useEffect(() => {
		if (open) {
			setSelected(new Set(defaultSelected));
			setQuery("");
			const api = getUdeler();
			if (api?.planner.analyzeDisk && courseData && coursePath) {
				const analysis = api.planner.analyzeDisk(courseData, coursePath);
				setDiskHint(
					analysis.missingKeys.length > 0
						? `${analysis.missingKeys.length} ${t("Missing or broken lessons")}`
						: t("All lectures already on disk")
				);
			} else {
				setDiskHint("");
			}
		}
	}, [open, defaultSelected, courseData, coursePath, t]);

	const applyMode = (mode: "all" | "videos" | "missing") => {
		const api = getUdeler();
		if (!api?.planner.selectKeys || !courseData) return;
		const keys = api.planner.selectKeys(courseData, mode, coursePath);
		setSelected(new Set(keys));
	};

	const normalizedQuery = query.trim().toLowerCase();

	const chapterMatches = useMemo(() => {
		if (!normalizedQuery) {
			return chapters.map((_, ci) => ({ chapterIndex: ci, lectureIndexes: null as number[] | null }));
		}
		return chapters
			.map((chapter, ci) => {
				const chapterHit = String(chapter.name || "")
					.toLowerCase()
					.includes(normalizedQuery);
				const lectureIndexes = (chapter.lectures || [])
					.map((lecture, li) =>
						String(lecture.name || "")
							.toLowerCase()
							.includes(normalizedQuery)
							? li
							: -1
					)
					.filter((li) => li >= 0);
				if (chapterHit) {
					return { chapterIndex: ci, lectureIndexes: null as number[] | null };
				}
				if (lectureIndexes.length === 0) return null;
				return { chapterIndex: ci, lectureIndexes };
			})
			.filter((row): row is { chapterIndex: number; lectureIndexes: number[] | null } => row !== null);
	}, [chapters, normalizedQuery]);

	const visibleLectureCount = useMemo(() => {
		return chapterMatches.reduce((sum, row) => {
			const chapter = chapters[row.chapterIndex];
			if (!chapter) return sum;
			if (row.lectureIndexes == null) return sum + (chapter.lectures || []).length;
			return sum + row.lectureIndexes.length;
		}, 0);
	}, [chapterMatches, chapters]);

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onCancel();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onCancel]);

	const stats = useMemo(() => {
		let videoCount = 0;
		let encryptedVideos = 0;
		chapters.forEach((chapter) => {
			(chapter.lectures || []).forEach((lecture) => {
				const quality = String(lecture.quality || "").toLowerCase();
				const type = String(lecture.type || "").toLowerCase();
				const isNonVideo =
					quality === "article" ||
					quality === "attachment" ||
					type === "article" ||
					type === "file" ||
					(type === "url" && !lecture.isEncrypted);
				if (isNonVideo) return;
				videoCount += 1;
				if (lecture.isEncrypted) encryptedVideos += 1;
			});
		});
		const total = videoCount || chapters.reduce((n, ch) => n + (ch.lectures || []).length, 0);
		const encrypted =
			videoCount > 0
				? encryptedVideos
				: chapters.reduce(
						(n, ch) => n + (ch.lectures || []).filter((l) => l.isEncrypted).length,
						0
					);
		const percent = total === 0 ? 0 : Math.round((encrypted / total) * 100);
		return {
			total,
			encrypted,
			percent,
			downloadable: Math.max(0, total - encrypted),
		};
	}, [chapters]);

	const selectableKeys = useMemo(() => {
		const keys: string[] = [];
		chapters.forEach((chapter, ci) => {
			(chapter.lectures || []).forEach((lecture, li) => {
				if (!lecture.isEncrypted) {
					keys.push(lectureKey(ci, li));
				}
			});
		});
		return keys;
	}, [chapters]);

	const allSelected =
		selectableKeys.length > 0 && selectableKeys.every((key) => selected.has(key));

	const toggleSelectAll = (checked: boolean) => {
		setSelected(checked ? new Set(selectableKeys) : new Set());
	};

	const toggleChapter = (chapterIndex: number, checked: boolean) => {
		const next = new Set(selected);
		const chapter = chapters[chapterIndex];
		(chapter?.lectures || []).forEach((lecture, li) => {
			if (lecture.isEncrypted) return;
			const key = lectureKey(chapterIndex, li);
			if (checked) next.add(key);
			else next.delete(key);
		});
		setSelected(next);
	};

	const toggleLecture = (key: string, checked: boolean) => {
		const next = new Set(selected);
		if (checked) next.add(key);
		else next.delete(key);
		setSelected(next);
	};

	const chapterChecked = (chapterIndex: number): boolean => {
		const chapter = chapters[chapterIndex];
		const keys = (chapter?.lectures || [])
			.map((lecture, li) => ({ lecture, key: lectureKey(chapterIndex, li) }))
			.filter(({ lecture }) => !lecture.isEncrypted)
			.map(({ key }) => key);
		return keys.length > 0 && keys.every((key) => selected.has(key));
	};

	const handleConfirm = () => {
		const keys = Array.from(selected);
		const api = getUdeler();
		const filtered =
			api?.planner?.filterCourse && courseData
				? api.planner.filterCourse(courseData, keys)
				: courseData;
		onConfirm(filtered, keys);
	};

	if (!open || !courseData) {
		return null;
	}

	const drmStatus =
		stats.percent >= 80
			? {
					badge: "bg-ud-danger text-white",
					label: "text-ud-danger",
				}
			: stats.percent > 0
				? {
						badge: "bg-ud-warning text-black",
						label: "text-ud-warning",
					}
				: {
						badge: "bg-ud-ok text-white",
						label: "text-ud-ok",
					};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby="planner-title"
		>
			<div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ud-border bg-ud-elevated shadow-2xl">
				<header className="flex items-start justify-between gap-3 border-b border-ud-border px-5 py-4">
					<div className="min-w-0">
						<h3 id="planner-title" className="truncate text-base font-semibold">
							{courseData.name || t("Course")}
						</h3>
						<p className="mt-1 text-xs text-ud-text-muted">
							{selected.size} {t("items")}
							{diskHint ? ` · ${diskHint}` : ""}
						</p>
					</div>
					<label className="flex items-center gap-2 text-xs text-ud-text-muted">
						<input
							type="checkbox"
							checked={allSelected}
							onChange={(e) => toggleSelectAll(e.target.checked)}
							className="rounded border-ud-border"
						/>
						{t("Select all")}
					</label>
				</header>

				<div className="flex flex-wrap gap-2 border-b border-ud-border px-5 py-3">
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={t("Search lessons")}
						className="min-w-[12rem] flex-1 rounded-lg border border-ud-border bg-ud-muted px-3 py-1.5 text-sm outline-none focus:border-ud-accent"
					/>
					<button
						type="button"
						onClick={() => applyMode("all")}
						className="rounded-lg border border-ud-border px-2.5 py-1 text-xs hover:bg-ud-muted"
					>
						{t("All downloadable")}
					</button>
					<button
						type="button"
						onClick={() => applyMode("videos")}
						className="rounded-lg border border-ud-border px-2.5 py-1 text-xs hover:bg-ud-muted"
					>
						{t("Only videos")}
					</button>
					<button
						type="button"
						onClick={() => applyMode("missing")}
						className="rounded-lg border border-ud-border px-2.5 py-1 text-xs hover:bg-ud-muted"
					>
						{t("Only missing")}
					</button>
				</div>

				<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
					<div className="rounded-xl border border-ud-border bg-ud-muted px-4 py-3">
						<div className="flex items-center gap-3">
							<span
								className={`inline-flex min-w-12 items-center justify-center rounded-lg px-2 py-1 text-sm font-semibold ${drmStatus.badge}`}
							>
								{stats.percent}%
							</span>
							<div className="min-w-0 flex-1">
								<p className={`text-sm font-medium ${drmStatus.label}`}>
									{t("Encrypted lessons")}: {stats.encrypted} / {stats.total}
								</p>
								<p className="mt-0.5 text-xs text-ud-text-muted">
									{stats.percent === 0
										? t("No DRM detected on selected content")
										: t(
												"Encrypted lessons cannot be downloaded. Attachments can still be saved."
											)}
								</p>
								{stats.encrypted > 0 && (
									<p className="mt-1 text-xs text-rose-300">
										{t("DRM videos are dimmed and cannot be selected")}
									</p>
								)}
							</div>
						</div>
					</div>

					{chapters.length === 0 ? (
						<p className="text-sm text-ud-text-muted">{t("No Courses Found")}</p>
					) : chapterMatches.length === 0 ? (
						<p className="text-sm text-ud-text-muted">
							{t("No lessons match")}
							{normalizedQuery ? `: “${query.trim()}”` : ""}
						</p>
					) : (
						chapterMatches.map(({ chapterIndex: ci, lectureIndexes }) => {
							const chapter = chapters[ci];
							if (!chapter) return null;
							const lectures = chapter.lectures || [];
							const visibleIndexes =
								lectureIndexes == null
									? lectures.map((_, li) => li)
									: lectureIndexes;
							return (
							<section key={`ch-${ci}`} className="rounded-xl border border-ud-border">
								<label className="flex cursor-pointer items-center gap-2 border-b border-ud-border px-3 py-2.5">
									<input
										type="checkbox"
										checked={chapterChecked(ci)}
										onChange={(e) => toggleChapter(ci, e.target.checked)}
									/>
									<span className="flex-1 text-sm font-medium">{chapter.name}</span>
									{(() => {
										const encryptedInChapter = lectures.filter((l) => l.isEncrypted).length;
										return encryptedInChapter > 0 ? (
											<span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-medium text-rose-300">
												DRM {encryptedInChapter}
											</span>
										) : null;
									})()}
									<span className="rounded-full bg-ud-muted px-2 py-0.5 text-[10px] text-ud-text-muted">
										{visibleIndexes.length}
										{normalizedQuery ? `/${lectures.length}` : ""}
									</span>
								</label>
								<div className="divide-y divide-ud-border/60">
									{visibleIndexes.map((li) => {
										const lecture = lectures[li];
										if (!lecture) return null;
										const key = lectureKey(ci, li);
										const locked = Boolean(lecture.isEncrypted);
										const qualityLabel = t(
											String(lecture.quality || lecture.type || "")
										);
										return (
											<label
												key={key}
												className={[
													"flex items-center gap-2 px-3 py-2 text-sm transition-opacity",
													locked
														? "pointer-events-none bg-rose-500/15 opacity-40"
														: "cursor-pointer",
												].join(" ")}
											>
												<input
													type="checkbox"
													disabled={locked}
													checked={!locked && selected.has(key)}
													onChange={(e) => toggleLecture(key, e.target.checked)}
												/>
												<span
													className={[
														"min-w-0 flex-1 truncate",
														locked ? "line-through" : "",
													].join(" ")}
												>
													{lecture.name}
												</span>
												<div className="flex shrink-0 items-center gap-2 text-[11px]">
													{locked ? (
														<span className="rounded-md bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
															DRM
														</span>
													) : isVideoLecture(lecture) ? (
														<span className="rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
															OK
														</span>
													) : (
														<span className="rounded-md bg-ud-muted px-1.5 py-0.5 text-[10px] font-medium text-ud-text-muted">
															{qualityLabel || t("Attachment")}
														</span>
													)}
													{lecture.duration ? (
														<span className="text-ud-text-muted">{lecture.duration}</span>
													) : null}
													{isVideoLecture(lecture) ? (
														<span className={locked ? "text-rose-300" : "text-ud-text-muted"}>
															{locked ? t("Encrypted") : qualityLabel}
														</span>
													) : null}
												</div>
											</label>
										);
									})}
								</div>
							</section>
							);
						})
					)}
					{normalizedQuery ? (
						<p className="text-xs text-ud-text-muted">
							{visibleLectureCount} {t("items")}
						</p>
					) : null}
				</div>

				<footer className="flex justify-end gap-2 border-t border-ud-border px-5 py-4">
					<button
						type="button"
						onClick={onCancel}
						className="rounded-lg border border-ud-border px-4 py-2 text-sm hover:bg-ud-muted"
					>
						{t("Cancel")}
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						disabled={selected.size === 0}
						className="rounded-lg bg-ud-accent px-4 py-2 text-sm font-medium text-white hover:bg-ud-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
					>
						{t("Download")}
					</button>
				</footer>
			</div>
		</div>
	);
}

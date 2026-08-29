import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { getUdeler } from "../hooks/useUdeler";

export interface PlannerLecture {
	name: string;
	isEncrypted?: boolean;
	quality?: string;
	type?: string;
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
	onCancel: () => void;
	onConfirm: (filtered: unknown, selectedKeys: string[]) => void;
}

function lectureKey(chapterIndex: number, lectureIndex: number): string {
	return `${chapterIndex}:${lectureIndex}`;
}

export function CoursePlannerModal({
	open,
	courseData,
	onCancel,
	onConfirm,
}: CoursePlannerModalProps) {
	const { t } = useI18n();
	const chapters = courseData?.chapters ?? [];

	const defaultSelected = useMemo(() => {
		const keys = new Set<string>();
		chapters.forEach((chapter, ci) => {
			(chapter.lectures || []).forEach((lecture, li) => {
				if (!lecture.isEncrypted) {
					keys.add(lectureKey(ci, li));
				}
			});
		});
		return keys;
	}, [chapters]);

	const [selected, setSelected] = useState<Set<string>>(defaultSelected);

	useEffect(() => {
		if (open) {
			setSelected(new Set(defaultSelected));
		}
	}, [open, defaultSelected]);

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
		const api = getUdeler();
		if (api?.planner?.stats && courseData) {
			return api.planner.stats(courseData);
		}
		let total = 0;
		let encrypted = 0;
		chapters.forEach((chapter) => {
			(chapter.lectures || []).forEach((lecture) => {
				total += 1;
				if (lecture.isEncrypted) encrypted += 1;
			});
		});
		const percent = total === 0 ? 0 : Math.round((encrypted / total) * 100);
		return { total, encrypted, percent };
	}, [chapters, courseData]);

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

	const drmTone =
		stats.percent >= 80
			? "border-ud-danger/40 bg-ud-danger/10 text-ud-danger"
			: stats.percent > 0
				? "border-ud-warning/40 bg-ud-warning/10 text-ud-warning"
				: "border-ud-ok/40 bg-ud-ok/10 text-ud-ok";

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

				<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
					<div className={`rounded-xl border px-4 py-3 ${drmTone}`}>
						<p className="text-2xl font-semibold">{stats.percent}%</p>
						<p className="text-sm">
							{t("Encrypted lessons")}: {stats.encrypted} / {stats.total}
						</p>
						<p className="mt-1 text-xs opacity-80">
							{stats.percent === 0
								? t("No DRM detected on selected content")
								: t(
										"Encrypted lessons cannot be downloaded. Attachments can still be saved."
									)}
						</p>
					</div>

					{chapters.length === 0 ? (
						<p className="text-sm text-ud-text-muted">{t("No Courses Found")}</p>
					) : (
						chapters.map((chapter, ci) => (
							<section key={`ch-${ci}`} className="rounded-xl border border-ud-border">
								<label className="flex cursor-pointer items-center gap-2 border-b border-ud-border px-3 py-2.5">
									<input
										type="checkbox"
										checked={chapterChecked(ci)}
										onChange={(e) => toggleChapter(ci, e.target.checked)}
									/>
									<span className="flex-1 text-sm font-medium">{chapter.name}</span>
									<span className="rounded-full bg-ud-muted px-2 py-0.5 text-[10px] text-ud-text-muted">
										{(chapter.lectures || []).length}
									</span>
								</label>
								<div className="divide-y divide-ud-border/60">
									{(chapter.lectures || []).map((lecture, li) => {
										const key = lectureKey(ci, li);
										const locked = Boolean(lecture.isEncrypted);
										return (
											<label
												key={key}
												className={[
													"flex items-center gap-2 px-3 py-2 text-sm",
													locked ? "opacity-50" : "cursor-pointer",
												].join(" ")}
											>
												<input
													type="checkbox"
													disabled={locked}
													checked={!locked && selected.has(key)}
													onChange={(e) => toggleLecture(key, e.target.checked)}
												/>
												<span className="min-w-0 flex-1 truncate">{lecture.name}</span>
												<span className="shrink-0 text-[11px] text-ud-text-muted">
													{locked
														? t("Encrypted")
														: t(String(lecture.quality || lecture.type || ""))}
												</span>
											</label>
										);
									})}
								</div>
							</section>
						))
					)}
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

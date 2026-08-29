import type { CourseCard as CourseCardModel } from "../../shared/udeler.d.ts";
import { useI18n } from "../hooks/useI18n";

export interface CourseProgressState {
	individualProgress?: number;
	combinedProgress?: number;
	progressStatus?: string;
	speedValue?: string;
	speedUnit?: string;
	qualityLabel?: string;
	paused?: boolean;
	active?: boolean;
	pathDownloaded?: string;
}

interface CourseCardProps {
	course: CourseCardModel;
	progress?: CourseProgressState;
	onDownload?: (course: CourseCardModel) => void;
	onCancel?: (course: CourseCardModel) => void;
	onPause?: (course: CourseCardModel) => void;
	onResume?: (course: CourseCardModel) => void;
	onOpenFolder?: (course: CourseCardModel) => void;
}

export function CourseCard({
	course,
	progress,
	onDownload,
	onCancel,
	onPause,
	onResume,
	onOpenFolder,
}: CourseCardProps) {
	const { t } = useI18n();
	const individual = progress?.individualProgress ?? course.individualProgress ?? 0;
	const combined = progress?.combinedProgress ?? course.combinedProgress ?? 0;
	const isActive = Boolean(progress?.active);
	const isPaused = Boolean(progress?.paused);
	const encrypted = Number(course.encryptedVideos ?? 0);
	const path = progress?.pathDownloaded || course.pathDownloaded;

	return (
		<article className="flex flex-col gap-3 rounded-xl border border-ud-border bg-ud-elevated p-4 sm:flex-row sm:items-start">
			<div className="relative h-24 w-full shrink-0 overflow-hidden rounded-lg bg-ud-muted sm:h-20 sm:w-36">
				{course.image ? (
					<img src={course.image} alt="" className="h-full w-full object-cover" />
				) : (
					<div className="flex h-full items-center justify-center text-xs text-ud-text-muted">
						{t("No image")}
					</div>
				)}
				{encrypted > 0 && (
					<span className="absolute left-0 top-0 rounded-br-md bg-ud-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">
						DRM
					</span>
				)}
			</div>

			<div className="min-w-0 flex-1 space-y-2">
				<div className="flex flex-wrap items-start justify-between gap-2">
					<div className="min-w-0">
						<h3 className="truncate text-sm font-semibold text-ud-text">{course.title}</h3>
						{progress?.progressStatus || course.progressStatus ? (
							<p className="mt-0.5 text-xs text-ud-text-muted">
								{progress?.progressStatus || course.progressStatus}
							</p>
						) : null}
					</div>
					<div className="flex flex-wrap gap-1.5">
						{!isActive && onDownload && (
							<button
								type="button"
								onClick={() => onDownload(course)}
								className="rounded-lg bg-ud-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-ud-accent-hover"
							>
								{t("Download")}
							</button>
						)}
						{isActive && !isPaused && onPause && (
							<button
								type="button"
								onClick={() => onPause(course)}
								className="rounded-lg border border-ud-border px-3 py-1.5 text-xs hover:bg-ud-muted"
							>
								{t("Pause")}
							</button>
						)}
						{isActive && isPaused && onResume && (
							<button
								type="button"
								onClick={() => onResume(course)}
								className="rounded-lg border border-ud-border px-3 py-1.5 text-xs hover:bg-ud-muted"
							>
								{t("Resume")}
							</button>
						)}
						{isActive && onCancel && (
							<button
								type="button"
								onClick={() => onCancel(course)}
								className="rounded-lg border border-ud-danger/40 px-3 py-1.5 text-xs text-ud-danger hover:bg-ud-danger/10"
							>
								{t("Cancel")}
							</button>
						)}
						{path && onOpenFolder && (
							<button
								type="button"
								onClick={() => onOpenFolder(course)}
								className="rounded-lg border border-ud-border px-3 py-1.5 text-xs hover:bg-ud-muted"
							>
								{t("Open")}
							</button>
						)}
					</div>
				</div>

				{(isActive || combined > 0 || individual > 0) && (
					<div className="space-y-1.5">
						<div className="h-1.5 overflow-hidden rounded-full bg-ud-muted">
							<div
								className="h-full rounded-full bg-ud-accent transition-all"
								style={{ width: `${Math.min(100, Math.max(0, individual))}%` }}
							/>
						</div>
						<div className="h-1.5 overflow-hidden rounded-full bg-ud-muted">
							<div
								className="h-full rounded-full bg-ud-ok/80 transition-all"
								style={{ width: `${Math.min(100, Math.max(0, combined))}%` }}
							/>
						</div>
						<div className="flex flex-wrap gap-3 text-[11px] text-ud-text-muted">
							{progress?.speedValue != null && (
								<span>
									{progress.speedValue} {progress.speedUnit || ""}
								</span>
							)}
							{progress?.qualityLabel && <span>{progress.qualityLabel}</span>}
							{course.completed && <span className="text-ud-ok">{t("Completed")}</span>}
						</div>
					</div>
				)}
			</div>
		</article>
	);
}

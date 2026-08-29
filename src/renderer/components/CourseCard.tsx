import { memo } from "react";
import type { CourseCard as CourseCardModel, CourseLocalStatus } from "../../shared/udeler.d.ts";
import { useI18n } from "../hooks/useI18n";

export interface CourseProgressState {
	individualProgress?: number;
	combinedProgress?: number;
	combinedTotal?: number;
	combinedDone?: number;
	progressStatus?: string;
	speedValue?: string;
	speedUnit?: string;
	qualityLabel?: string;
	paused?: boolean;
	active?: boolean;
	error?: boolean;
	pathDownloaded?: string;
}

interface CourseCardProps {
	course: CourseCardModel;
	progress?: CourseProgressState;
	status?: CourseLocalStatus;
	selected?: boolean;
	selectable?: boolean;
	onSelectChange?: (course: CourseCardModel, selected: boolean) => void;
	onDownload?: (course: CourseCardModel) => void;
	onCancel?: (course: CourseCardModel) => void;
	onPause?: (course: CourseCardModel) => void;
	onResume?: (course: CourseCardModel) => void;
	onOpenFolder?: (course: CourseCardModel) => void;
	onDetails?: (course: CourseCardModel) => void;
}

const STATUS_STYLES: Record<CourseLocalStatus, string> = {
	idle: "bg-ud-muted text-ud-text-muted",
	queued: "bg-amber-500 text-white",
	downloading: "bg-ud-accent text-white",
	paused: "bg-slate-500 text-white",
	downloaded: "bg-emerald-600 text-white",
	partial: "bg-sky-600 text-white",
	error: "bg-ud-danger text-white",
	missing: "bg-ud-danger text-white",
};

function statusLabel(status: CourseLocalStatus, t: (key: string) => string): string {
	switch (status) {
		case "queued":
			return t("queued");
		case "downloading":
			return t("Downloading");
		case "paused":
			return t("Paused");
		case "downloaded":
			return t("Downloaded");
		case "partial":
			return t("Partial");
		case "error":
			return t("Download Failed");
		case "missing":
			return t("Missing folder");
		default:
			return "";
	}
}

function CourseCardComponent({
	course,
	progress,
	status = "idle",
	selected = false,
	selectable = false,
	onSelectChange,
	onDownload,
	onCancel,
	onPause,
	onResume,
	onOpenFolder,
	onDetails,
}: CourseCardProps) {
	const { t } = useI18n();
	const individual = progress?.individualProgress ?? course.individualProgress ?? 0;
	const combined = progress?.combinedProgress ?? course.combinedProgress ?? 0;
	const isActive = Boolean(progress?.active) || status === "downloading" || status === "queued";
	const isPaused = Boolean(progress?.paused) || status === "paused";
	const encrypted = Number(course.encryptedVideos ?? 0);
	const path = progress?.pathDownloaded || course.pathDownloaded;
	const badge = statusLabel(status, t);
	const drmChecked = Boolean(course.drmChecked);

	const metaParts: string[] = [];
	if (course.instructor) metaParts.push(course.instructor);
	if (course.lectureCount != null && course.lectureCount > 0) {
		metaParts.push(`${course.lectureCount} ${t("Lectures")}`);
	}
	if (course.duration) metaParts.push(course.duration);
	if (course.completionRatio != null && course.completionRatio > 0) {
		metaParts.push(`${Math.round(course.completionRatio)}%`);
	}

	return (
		<article
			style={{ contentVisibility: "auto", containIntrinsicSize: "auto 140px" }}
			className={[
				"flex flex-col gap-3 rounded-xl border bg-ud-elevated p-4 sm:flex-row sm:items-start",
				selected ? "border-ud-accent/60" : "border-ud-border",
			].join(" ")}
		>
			{selectable && (
				<label className="flex items-start pt-1">
					<input
						type="checkbox"
						checked={selected}
						onChange={(e) => onSelectChange?.(course, e.target.checked)}
						className="mt-1 rounded border-ud-border"
						aria-label={t("Select course")}
					/>
				</label>
			)}

			<div className="relative h-24 w-full shrink-0 overflow-hidden rounded-lg bg-ud-muted sm:h-20 sm:w-36">
				{course.image ? (
					<img
						src={course.image}
						alt=""
						loading="lazy"
						decoding="async"
						className="h-full w-full object-cover"
					/>
				) : (
					<div className="flex h-full items-center justify-center text-xs text-ud-text-muted">
						{t("No image")}
					</div>
				)}
				{drmChecked && encrypted > 0 && (
					<span className="absolute left-0 top-0 rounded-br-md bg-ud-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">
						DRM {encrypted}
						{course.videoCount ? `/${course.videoCount}` : ""}
					</span>
				)}
				{drmChecked && encrypted === 0 && (
					<span className="absolute left-0 top-0 rounded-br-md bg-ud-ok px-1.5 py-0.5 text-[10px] font-semibold text-white">
						{t("No DRM")}
					</span>
				)}
				{!drmChecked && course.drmFailed && (
					<span className="absolute left-0 top-0 rounded-br-md bg-ud-warning/90 px-1.5 py-0.5 text-[10px] font-semibold text-black">
						DRM ?
					</span>
				)}
				{!drmChecked && !course.drmFailed && (
					<span className="absolute left-0 top-0 rounded-br-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white/80">
						{t("Checking DRM")}…
					</span>
				)}
			</div>

			<div className="min-w-0 flex-1 space-y-2">
				<div className="flex flex-wrap items-start justify-between gap-2">
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2">
							<h3 className="truncate text-sm font-semibold text-ud-text">{course.title}</h3>
							{badge && (
								<span
									className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[status]}`}
								>
									{badge}
								</span>
							)}
							{drmChecked && encrypted > 0 && (
								<span className="rounded-full bg-ud-danger px-2 py-0.5 text-[10px] font-semibold text-white">
									{t("With DRM")}
								</span>
							)}
							{drmChecked && encrypted === 0 && (
								<span className="rounded-full bg-ud-ok px-2 py-0.5 text-[10px] font-semibold text-white">
									{t("No DRM")}
								</span>
							)}
							{!drmChecked && course.drmFailed && (
								<span className="rounded-full bg-ud-warning px-2 py-0.5 text-[10px] font-semibold text-black">
									{t("DRM check failed")}
								</span>
							)}
							{!drmChecked && !course.drmFailed && (
								<span className="rounded-full bg-slate-600 px-2 py-0.5 text-[10px] font-semibold text-white">
									{t("Checking DRM")}…
								</span>
							)}
						</div>
						{metaParts.length > 0 && (
							<p className="mt-1 truncate text-xs text-ud-text-muted">{metaParts.join(" · ")}</p>
						)}
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
								{status === "error" || status === "partial" || status === "missing"
									? t("Retry failed")
									: status === "downloaded"
										? t("Only missing")
										: t("Download")}
							</button>
						)}
						{isActive && !isPaused && onPause && status !== "queued" && (
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
								className="rounded-lg border border-ud-danger/50 bg-transparent px-3 py-1.5 text-xs font-medium text-ud-danger hover:bg-ud-danger/10"
							>
								{t("Cancel")}
							</button>
						)}
						{onDetails && !isActive && (
							<button
								type="button"
								onClick={() => onDetails(course)}
								className="rounded-lg border border-ud-border px-3 py-1.5 text-xs hover:bg-ud-muted"
							>
								{t("Details")}
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
								className="h-full rounded-full transition-all"
								style={{
									width: `${Math.min(100, Math.max(0, combined))}%`,
									backgroundColor: "var(--ud-ok)",
								}}
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

export const CourseCard = memo(CourseCardComponent);

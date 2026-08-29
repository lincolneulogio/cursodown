import { useCallback, useEffect, useState } from "react";
import type { DashboardSnapshot } from "../../shared/udeler.d.ts";
import { useI18n } from "../hooks/useI18n";
import { getUdeler } from "../hooks/useUdeler";

interface DashboardPageProps {
	onBusy?: (busy: boolean, message?: string) => void;
	onOpenLibrary?: () => void;
}

function formatEta(seconds: number | null, t: (k: string) => string): string {
	if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
	if (seconds < 60) return `${seconds}s`;
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	if (m < 60) return `${m}m ${s}s`;
	const h = Math.floor(m / 60);
	return `${h}h ${m % 60}m`;
}

function formatSpeed(bps: number, api: ReturnType<typeof getUdeler>): string {
	if (!bps) return "—";
	const size = api?.library.formatSize(bps) || `${Math.round(bps)} B`;
	return `${size}/s`;
}

export function DashboardPage({ onOpenLibrary }: DashboardPageProps) {
	const { t } = useI18n();
	const [snap, setSnap] = useState<DashboardSnapshot | null>(null);

	const refresh = useCallback(() => {
		const api = getUdeler();
		if (!api?.dashboard) return;
		setSnap(api.dashboard.getSnapshot());
	}, []);

	useEffect(() => {
		refresh();
		const timer = window.setInterval(refresh, 1500);
		return () => window.clearInterval(timer);
	}, [refresh]);

	const api = getUdeler();
	const disk = snap?.disk;
	const libraryLabel = api?.library.formatSize(disk?.libraryBytes || 0) || "—";
	const freeLabel = api?.library.formatSize(disk?.freeBytes || 0) || "—";
	const totalLabel = api?.library.formatSize(disk?.totalBytes || 0) || "—";
	const usedPct =
		disk && disk.totalBytes > 0
			? Math.min(100, Math.round((disk.usedBytes / disk.totalBytes) * 100))
			: 0;

	return (
		<div className="space-y-5">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold">{t("Dashboard")}</h2>
					<p className="mt-1 text-sm text-ud-text-muted">{t("Progress, disk space and ETA")}</p>
				</div>
				<button
					type="button"
					onClick={refresh}
					className="rounded-lg border border-ud-border px-3 py-1.5 text-sm hover:bg-ud-muted"
				>
					{t("Refresh")}
				</button>
			</header>

			<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<div className="rounded-xl border border-ud-border bg-ud-elevated p-4">
					<p className="text-xs text-ud-text-muted">{t("Queue")}</p>
					<p className="mt-1 text-2xl font-semibold">
						{snap?.queue.running ?? 0}
						<span className="text-base font-normal text-ud-text-muted">
							/{snap?.queue.concurrency ?? 0}
						</span>
					</p>
					<p className="mt-1 text-xs text-ud-text-muted">
						{snap?.queue.pending ?? 0} {t("pending")}
					</p>
				</div>
				<div className="rounded-xl border border-ud-border bg-ud-elevated p-4">
					<p className="text-xs text-ud-text-muted">{t("Library size")}</p>
					<p className="mt-1 text-2xl font-semibold">{libraryLabel}</p>
					<p className="mt-1 truncate text-xs text-ud-text-muted">{snap?.downloadPath}</p>
				</div>
				<div className="rounded-xl border border-ud-border bg-ud-elevated p-4">
					<p className="text-xs text-ud-text-muted">{t("Free disk")}</p>
					<p className="mt-1 text-2xl font-semibold">{freeLabel}</p>
					<p className="mt-1 text-xs text-ud-text-muted">
						{t("of")} {totalLabel} · {usedPct}% {t("used")}
					</p>
					<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ud-muted">
						<div
							className="h-full rounded-full bg-ud-accent"
							style={{ width: `${usedPct}%` }}
						/>
					</div>
				</div>
				<div className="rounded-xl border border-ud-border bg-ud-elevated p-4">
					<p className="text-xs text-ud-text-muted">{t("Courses on disk")}</p>
					<p className="mt-1 text-2xl font-semibold">{snap?.courses.length ?? 0}</p>
					<button
						type="button"
						onClick={onOpenLibrary}
						className="mt-2 text-xs text-ud-accent-hover hover:underline"
					>
						{t("Open library")}
					</button>
				</div>
			</section>

			<section className="space-y-3">
				<h3 className="text-sm font-semibold">{t("Active downloads")}</h3>
				{(snap?.active.length ?? 0) === 0 ? (
					<p className="rounded-xl border border-dashed border-ud-border px-4 py-8 text-center text-sm text-ud-text-muted">
						{t("No active downloads")}
					</p>
				) : (
					<ul className="space-y-2">
						{snap?.active.map((item) => (
							<li
								key={item.courseId}
								className="rounded-xl border border-ud-border bg-ud-elevated px-4 py-3"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<p className="truncate text-sm font-medium">{item.title}</p>
									<p className="text-xs text-ud-text-muted">
										{formatSpeed(item.speedBps, api)} · ETA{" "}
										{formatEta(item.etaSeconds, t)}
									</p>
								</div>
								<div className="mt-2 h-2 overflow-hidden rounded-full bg-ud-muted">
									<div
										className="h-full rounded-full bg-ud-ok transition-all"
										style={{ width: `${item.progress}%` }}
									/>
								</div>
								<p className="mt-1 text-xs text-ud-text-muted">{item.progress}%</p>
							</li>
						))}
					</ul>
				)}
			</section>

			<section className="space-y-3">
				<h3 className="text-sm font-semibold">{t("Course progress")}</h3>
				{(snap?.courses.length ?? 0) === 0 ? (
					<p className="rounded-xl border border-dashed border-ud-border px-4 py-8 text-center text-sm text-ud-text-muted">
						{t("No Courses Found")}
					</p>
				) : (
					<ul className="space-y-2">
						{snap?.courses.slice(0, 40).map((course) => (
							<li
								key={course.id}
								className="rounded-xl border border-ud-border bg-ud-elevated px-4 py-3"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<p className="truncate text-sm font-medium">{course.name}</p>
									<p className="text-xs text-ud-text-muted">
										{api?.library.formatSize(course.sizeBytes) || "—"}
										{course.brokenCount > 0
											? ` · ${course.brokenCount} ${t("Broken")}`
											: ""}
									</p>
								</div>
								<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ud-muted">
									<div
										className={[
											"h-full rounded-full transition-all",
											course.progress >= 100 ? "bg-ud-ok" : "bg-ud-accent",
										].join(" ")}
										style={{ width: `${Math.min(100, course.progress)}%` }}
									/>
								</div>
								<p className="mt-1 text-xs text-ud-text-muted">
									{course.progress}%
									{!course.exists ? ` · ${t("Missing folder")}` : ""}
								</p>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}

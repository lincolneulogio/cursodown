import { useCallback, useEffect, useMemo, useState } from "react";
import type { CourseCard as CourseCardModel, CoursesTab } from "../../shared/udeler.d.ts";
import { CourseCard, type CourseProgressState } from "../components/CourseCard";
import {
	CoursePlannerModal,
	type PlannerCourseData,
} from "../components/CoursePlannerModal";
import { useI18n } from "../hooks/useI18n";
import { getUdeler } from "../hooks/useUdeler";

interface CoursesPageProps {
	onBusy: (busy: boolean, message?: string) => void;
	onQueueChange: () => void;
}

interface CoursesResponse {
	results?: unknown[];
	next?: string | string[] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toCourseCard(raw: unknown): CourseCardModel | null {
	if (!isRecord(raw)) return null;
	const id = raw.id;
	if (id === undefined || id === null) return null;
	const title =
		asString(raw.title) || asString(raw.name) || asString(raw.published_title) || String(id);
	const image =
		asString(raw.image) ||
		asString(raw.image_480x270) ||
		asString(raw.image_240x135) ||
		undefined;

	return {
		id: id as string | number,
		title,
		url: asString(raw.url),
		image,
		completed: Boolean(raw.completed),
		encryptedVideos: asNumber(raw.encryptedVideos) ?? asNumber(raw.encrypted_videos) ?? 0,
		pathDownloaded: asString(raw.pathDownloaded) || asString(raw.path_downloaded),
		individualProgress: asNumber(raw.individualProgress),
		combinedProgress: asNumber(raw.combinedProgress),
		progressStatus: asString(raw.progressStatus),
		selectedSubtitle: asString(raw.selectedSubtitle),
	};
}

function normalizeList(payload: unknown): { courses: CourseCardModel[]; next: string | null } {
	if (!isRecord(payload)) {
		return { courses: [], next: null };
	}
	const results = Array.isArray(payload.results) ? payload.results : [];
	const courses = results.map(toCourseCard).filter((c): c is CourseCardModel => c !== null);
	const nextRaw = payload.next;
	let next: string | null = null;
	if (typeof nextRaw === "string") next = nextRaw;
	else if (Array.isArray(nextRaw) && typeof nextRaw[0] === "string") next = nextRaw[0];
	return { courses, next };
}

function asPlannerCourse(raw: unknown, fallbackTitle: string): PlannerCourseData | null {
	if (!isRecord(raw)) return null;
	const chapters = Array.isArray(raw.chapters) ? raw.chapters : [];
	return {
		...raw,
		name: asString(raw.name) || asString(raw.title) || fallbackTitle,
		chapters: chapters as PlannerCourseData["chapters"],
	};
}

export function CoursesPage({ onBusy, onQueueChange }: CoursesPageProps) {
	const { t } = useI18n();
	const [tab, setTab] = useState<CoursesTab>("catalog");
	const [catalog, setCatalog] = useState<CourseCardModel[]>([]);
	const [downloads, setDownloads] = useState<CourseCardModel[]>([]);
	const [nextUrl, setNextUrl] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [progressMap, setProgressMap] = useState<Record<string, CourseProgressState>>({});
	const [plannerOpen, setPlannerOpen] = useState(false);
	const [plannerCourse, setPlannerCourse] = useState<PlannerCourseData | null>(null);
	const [pendingCourseId, setPendingCourseId] = useState<string | number | null>(null);
	const [message, setMessage] = useState("");

	const refreshDownloads = useCallback(() => {
		const api = getUdeler();
		if (!api) return;
		const list = api.downloads.getDownloadedCourses() || [];
		setDownloads(list);
	}, []);

	const loadCatalog = useCallback(
		async (keyword?: string) => {
			const api = getUdeler();
			if (!api) return;
			onBusy(true, t("Loading"));
			setMessage("");
			try {
				const payload = keyword?.trim()
					? await api.courses.search(keyword.trim())
					: await api.courses.fetch();
				const { courses, next } = normalizeList(payload as CoursesResponse);
				setCatalog(courses);
				setNextUrl(next);
				if (courses.length === 0) {
					setMessage(t("No Courses Found"));
				}
			} catch (err) {
				const detail = err instanceof Error ? err.message : String(err);
				setMessage(detail);
				api.logs.append("Courses fetch failed", detail);
			} finally {
				onBusy(false);
			}
		},
		[onBusy, t]
	);

	useEffect(() => {
		void loadCatalog();
		refreshDownloads();
	}, [loadCatalog, refreshDownloads]);

	useEffect(() => {
		const api = getUdeler();
		if (!api) return;
		return api.downloads.onEvent((event, payload) => {
			const courseId = String(payload.courseId);
			setProgressMap((prev) => {
				const current = { ...(prev[courseId] || {}), active: true };
				switch (event) {
					case "path":
						if (typeof payload.downloadPath === "string") {
							current.pathDownloaded = payload.downloadPath;
						}
						break;
					case "progress:individual":
						if (typeof payload.percent === "number") {
							current.individualProgress = payload.percent;
						}
						break;
					case "progress:combined":
						if (payload.action === "increment") {
							current.combinedProgress = Math.min(
								100,
								(current.combinedProgress || 0) + 1
							);
						} else if (typeof payload.percent === "number") {
							current.combinedProgress = payload.percent;
						}
						break;
					case "speed":
						if (typeof payload.value === "string" || typeof payload.value === "number") {
							current.speedValue = String(payload.value);
						}
						if (typeof payload.unit === "string") {
							current.speedUnit = payload.unit;
						}
						break;
					case "quality":
						if (typeof payload.label === "string") {
							current.qualityLabel = payload.label;
						}
						break;
					case "pause-state":
						current.paused = Boolean(payload.paused);
						break;
					case "complete":
					case "error":
					case "cancelled":
					case "encrypted-stop":
						current.active = false;
						current.paused = false;
						if (event === "complete") {
							current.individualProgress = 100;
							current.combinedProgress = 100;
							current.progressStatus = t("Completed");
						}
						break;
					default:
						break;
				}
				return { ...prev, [courseId]: current };
			});
			if (
				event === "complete" ||
				event === "error" ||
				event === "cancelled" ||
				event === "encrypted-stop"
			) {
				refreshDownloads();
				onQueueChange();
			}
			if (event === "path" || event === "progress:combined") {
				onQueueChange();
			}
		});
	}, [onQueueChange, refreshDownloads, t]);

	const loadMore = async () => {
		const api = getUdeler();
		if (!api || !nextUrl) return;
		onBusy(true, t("Loading"));
		try {
			const payload = await api.courses.loadMore(nextUrl);
			const { courses, next } = normalizeList(payload);
			setCatalog((prev) => [...prev, ...courses]);
			setNextUrl(next);
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			api.logs.append("Load more failed", detail);
		} finally {
			onBusy(false);
		}
	};

	const startDownload = async (course: CourseCardModel) => {
		const api = getUdeler();
		if (!api) return;
		onBusy(true, t("Loading"));
		try {
			const content = await api.courses.fetchContent(course.id);
			const planner = asPlannerCourse(content, course.title);
			if (!planner) {
				api.dialog.showErrorBox(t("Error"), t("Course not found"));
				return;
			}
			setPendingCourseId(course.id);
			setPlannerCourse(planner);
			setPlannerOpen(true);
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			api.dialog.showErrorBox(t("Error"), detail);
			api.logs.append("fetchContent failed", detail);
		} finally {
			onBusy(false);
		}
	};

	const confirmPlanner = (filtered: unknown) => {
		const api = getUdeler();
		if (!api || pendingCourseId == null) {
			setPlannerOpen(false);
			return;
		}
		const snapshot = api.settings.getSnapshot();
		const subtitle =
			typeof snapshot.download.defaultSubtitle === "string"
				? snapshot.download.defaultSubtitle
				: undefined;
		const result = api.downloads.enqueue(pendingCourseId, filtered, subtitle);
		setProgressMap((prev) => ({
			...prev,
			[String(pendingCourseId)]: {
				...(prev[String(pendingCourseId)] || {}),
				active: result !== "duplicate",
				paused: false,
				progressStatus: result === "queued" ? t("queued") : t("Download"),
			},
		}));
		setPlannerOpen(false);
		setPlannerCourse(null);
		setPendingCourseId(null);
		refreshDownloads();
		onQueueChange();
		if (result === "duplicate") {
			setMessage(t("Already in queue"));
		}
	};

	const openFolder = async (course: CourseCardModel) => {
		const api = getUdeler();
		const path =
			progressMap[String(course.id)]?.pathDownloaded || course.pathDownloaded;
		if (!api || !path) return;
		await api.shell.openPath(path);
	};

	const list = useMemo(
		() => (tab === "catalog" ? catalog : downloads),
		[tab, catalog, downloads]
	);

	return (
		<div className="space-y-5">
			<header>
				<h2 className="text-xl font-semibold">{t("Courses")}</h2>
				<p className="mt-1 text-sm text-ud-text-muted">
					{t("Remember, you will only be able to see the courses you are enrolled in")}
				</p>
			</header>

			<nav className="flex gap-2 border-b border-ud-border pb-2" role="tablist">
				{(
					[
						{ id: "catalog" as const, label: t("Courses") },
						{ id: "downloads" as const, label: t("Downloads") },
					] as const
				).map((item) => (
					<button
						key={item.id}
						type="button"
						role="tab"
						aria-selected={tab === item.id}
						onClick={() => setTab(item.id)}
						className={[
							"rounded-lg px-3 py-1.5 text-sm",
							tab === item.id
								? "bg-ud-accent text-white"
								: "text-ud-text-muted hover:bg-ud-muted",
						].join(" ")}
					>
						{item.label}
					</button>
				))}
			</nav>

			{tab === "catalog" && (
				<form
					className="flex gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						void loadCatalog(query);
					}}
				>
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={t("Search Courses")}
						className="w-full rounded-lg border border-ud-border bg-ud-elevated px-3 py-2 text-sm outline-none focus:border-ud-accent"
					/>
					<button
						type="submit"
						className="rounded-lg bg-ud-accent px-4 py-2 text-sm font-medium text-white hover:bg-ud-accent-hover"
					>
						{t("Search")}
					</button>
				</form>
			)}

			{tab === "downloads" && (
				<p className="text-sm text-ud-text-muted">
					{t("Downloads in this session and previous ones")}
				</p>
			)}

			{message && <p className="text-sm text-ud-warning">{message}</p>}

			<div className="space-y-3">
				{list.length === 0 ? (
					<p className="rounded-xl border border-dashed border-ud-border px-4 py-8 text-center text-sm text-ud-text-muted">
						{tab === "downloads"
							? t("There are no Downloads to display")
							: t("No Courses Found")}
					</p>
				) : (
					list.map((course) => (
						<CourseCard
							key={String(course.id)}
							course={course}
							progress={progressMap[String(course.id)]}
							onDownload={tab === "catalog" ? (c) => void startDownload(c) : undefined}
							onCancel={(c) => {
								getUdeler()?.downloads.cancel(c.id);
								onQueueChange();
							}}
							onPause={(c) => getUdeler()?.downloads.pause(c.id)}
							onResume={(c) => getUdeler()?.downloads.resume(c.id)}
							onOpenFolder={(c) => void openFolder(c)}
						/>
					))
				)}
			</div>

			{tab === "catalog" && nextUrl && (
				<button
					type="button"
					onClick={() => void loadMore()}
					className="w-full rounded-lg border border-ud-border py-2.5 text-sm hover:bg-ud-muted"
				>
					{t("Load More")}
				</button>
			)}

			<CoursePlannerModal
				open={plannerOpen}
				courseData={plannerCourse}
				onCancel={() => {
					setPlannerOpen(false);
					setPlannerCourse(null);
					setPendingCourseId(null);
				}}
				onConfirm={(filtered) => confirmPlanner(filtered)}
			/>
		</div>
	);
}

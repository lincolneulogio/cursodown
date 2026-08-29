import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	CourseCard as CourseCardModel,
	CourseLocalStatus,
	CoursesTab,
} from "../../shared/udeler.d.ts";
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

interface LibraryIndexEntry {
	id: string;
	path: string;
	completed: boolean;
	encryptedVideos: number;
	exists: boolean;
}

interface DrmScanOk {
	id: string;
	encryptedVideos: number;
	videoCount: number;
}

type CourseFilter = "all" | "notDownloaded" | "downloaded" | "drm" | "noDrm";
type CourseSort = "recent" | "az" | "notDownloadedFirst";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function extractInstructor(raw: Record<string, unknown>): string | undefined {
	const instructors = raw.visible_instructors;
	if (!Array.isArray(instructors) || instructors.length === 0) return undefined;
	const first = instructors[0];
	if (!isRecord(first)) return undefined;
	return (
		asString(first.display_name) ||
		asString(first.title) ||
		asString(first.name) ||
		undefined
	);
}

function toCourseCard(raw: unknown): CourseCardModel | null {
	if (!isRecord(raw)) return null;
	const nested = isRecord(raw.course) ? { ...raw, ...raw.course } : raw;
	const id = nested.id;
	if (id === undefined || id === null) return null;
	const title =
		asString(nested.title) ||
		asString(nested.name) ||
		asString(nested.published_title) ||
		String(id);
	const image =
		asString(nested.image) ||
		asString(nested.image_480x270) ||
		asString(nested.image_240x135) ||
		undefined;
	const completion =
		asNumber(nested.completion_ratio) ?? asNumber(nested.completionRatio);

	return {
		id: id as string | number,
		title,
		url: asString(nested.url),
		image,
		completed: Boolean(nested.completed),
		encryptedVideos:
			asNumber(nested.encryptedVideos) ?? asNumber(nested.encrypted_videos) ?? 0,
		pathDownloaded: asString(nested.pathDownloaded) || asString(nested.path_downloaded),
		individualProgress: asNumber(nested.individualProgress),
		combinedProgress: asNumber(nested.combinedProgress),
		progressStatus: asString(nested.progressStatus),
		selectedSubtitle: asString(nested.selectedSubtitle),
		lectureCount:
			asNumber(nested.num_lectures) ??
			asNumber(nested.num_published_lectures) ??
			asNumber(nested.lectureCount),
		duration: asString(nested.content_info) || asString(nested.duration),
		instructor: extractInstructor(nested),
		completionRatio: completion != null ? completion * (completion <= 1 ? 100 : 1) : undefined,
		lastAccessed: asString(nested.last_accessed_time) || asString(nested.lastAccessed),
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
	if (chapters.length === 0) return null;
	return {
		...raw,
		name: asString(raw.name) || asString(raw.title) || fallbackTitle,
		chapters: chapters as PlannerCourseData["chapters"],
	};
}

function resolveLocalStatus(
	course: CourseCardModel,
	progress: CourseProgressState | undefined,
	library: LibraryIndexEntry | undefined,
	api: ReturnType<typeof getUdeler>
): CourseLocalStatus {
	if (progress?.error) return "error";
	if (progress?.paused) return "paused";
	if (progress?.active) {
		if (api?.downloads.isQueued(course.id)) return "queued";
		return "downloading";
	}
	if (api?.downloads.isQueued(course.id)) return "queued";
	if (api?.downloads.isDownloading(course.id)) return "downloading";

	const path = progress?.pathDownloaded || course.pathDownloaded || library?.path;
	const completed = Boolean(course.completed || library?.completed);
	const exists = library ? library.exists : Boolean(path);
	const encrypted = Math.max(
		Number(course.encryptedVideos || 0),
		Number(library?.encryptedVideos || 0)
	);

	if (path || library) {
		if (!exists) return "missing";
		if (completed) return "downloaded";
		if (encrypted > 0) return "partial";
		const combined = progress?.combinedProgress ?? course.combinedProgress ?? 0;
		if (combined > 0 && combined < 100) return "partial";
		return "downloaded";
	}

	return "idle";
}

export function CoursesPage({ onBusy, onQueueChange }: CoursesPageProps) {
	const { t } = useI18n();
	const [tab, setTab] = useState<CoursesTab>("catalog");
	const [catalog, setCatalog] = useState<CourseCardModel[]>([]);
	const [downloads, setDownloads] = useState<CourseCardModel[]>([]);
	const [libraryIndex, setLibraryIndex] = useState<Record<string, LibraryIndexEntry>>({});
	const [nextUrl, setNextUrl] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [progressMap, setProgressMap] = useState<Record<string, CourseProgressState>>({});
	const [plannerOpen, setPlannerOpen] = useState(false);
	const [plannerCourse, setPlannerCourse] = useState<PlannerCourseData | null>(null);
	const [plannerPath, setPlannerPath] = useState("");
	const [pendingCourseId, setPendingCourseId] = useState<string | number | null>(null);
	const [message, setMessage] = useState("");
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [filter, setFilter] = useState<CourseFilter>("all");
	const [sort, setSort] = useState<CourseSort>("recent");
	const skipSearchEffect = useRef(true);

	const refreshDownloads = useCallback(() => {
		const api = getUdeler();
		if (!api) return;
		const list = (api.downloads.getDownloadedCourses() || [])
			.map(toCourseCard)
			.filter((c): c is CourseCardModel => c !== null);
		setDownloads(list);

		const index: Record<string, LibraryIndexEntry> = {};
		for (const item of api.library.list({ scanIntegrity: false })) {
			index[String(item.id)] = {
				id: item.id,
				path: item.path,
				completed: item.completed,
				encryptedVideos: item.encryptedVideos,
				exists: item.exists,
			};
			if (item.name) {
				const byName = list.find((c) => c.title === item.name);
				if (byName) {
					index[String(byName.id)] = {
						id: String(byName.id),
						path: item.path,
						completed: item.completed,
						encryptedVideos: item.encryptedVideos,
						exists: item.exists,
					};
				}
			}
		}
		setLibraryIndex(index);
	}, []);

	const persistDownloadedCourse = useCallback(
		(courseId: string, patch: Partial<CourseCardModel>) => {
			const api = getUdeler();
			if (!api) return;
			const current = api.downloads.getDownloadedCourses() || [];
			const mapped = current.map(toCourseCard).filter((c): c is CourseCardModel => c !== null);
			const fromCatalog = catalog.find((c) => String(c.id) === courseId);
			const existing = mapped.find((c) => String(c.id) === courseId);
			const nextEntry: CourseCardModel = {
				...(fromCatalog || existing || { id: courseId, title: courseId }),
				...existing,
				...patch,
				id: existing?.id ?? fromCatalog?.id ?? courseId,
			};
			const next = [
				nextEntry,
				...mapped.filter((c) => String(c.id) !== courseId),
			];
			api.settings.save({ downloadedCourses: next });
			setDownloads(next);
		},
		[catalog]
	);

	const scanningDrmRef = useRef(false);
	const drmRescanRequestedRef = useRef(false);
	const drmFailedRef = useRef<Set<string>>(new Set());
	const drmDoneIdsRef = useRef<Set<string>>(new Set());
	const catalogRef = useRef<CourseCardModel[]>([]);
	const scrollingRef = useRef(false);
	const scrollIdleTimerRef = useRef<number | null>(null);
	const pendingDrmPatchRef = useRef<{
		ok: DrmScanOk[];
		failedIds: string[];
	} | null>(null);
	const drmFlushTimerRef = useRef<number | null>(null);

	const applyDrmCache = useCallback((courses: CourseCardModel[]): CourseCardModel[] => {
		const api = getUdeler();
		const cache = api?.courses.getDrmCache?.() || {};
		return courses.map((course) => {
			const hit = cache[String(course.id)];
			if (!hit) return { ...course, drmChecked: false };
			return {
				...course,
				encryptedVideos: hit.encryptedVideos,
				videoCount: hit.videoCount,
				drmChecked: true,
			};
		});
	}, []);

	const flushDrmPatches = useCallback(() => {
		const patch = pendingDrmPatchRef.current;
		if (!patch) return;
		if (scrollingRef.current) return;
		pendingDrmPatchRef.current = null;
		if (drmFlushTimerRef.current != null) {
			window.clearTimeout(drmFlushTimerRef.current);
			drmFlushTimerRef.current = null;
		}

		const okById = new Map(patch.ok.map((item) => [item.id, item]));
		const failed = new Set(patch.failedIds);

		startTransition(() => {
			setCatalog((prev) => {
				let changed = false;
				const next = prev.map((course) => {
					const id = String(course.id);
					const hit = okById.get(id);
					if (hit) {
						changed = true;
						return {
							...course,
							encryptedVideos: hit.encryptedVideos,
							videoCount: hit.videoCount,
							drmChecked: true,
							drmFailed: false,
						};
					}
					if (failed.has(id) && !course.drmFailed) {
						changed = true;
						return { ...course, drmChecked: false, drmFailed: true };
					}
					return course;
				});
				if (!changed) return prev;
				catalogRef.current = next;
				return next;
			});
		});
	}, []);

	const queueDrmPatches = useCallback(
		(ok: DrmScanOk[], failedIds: string[]) => {
			const current = pendingDrmPatchRef.current || { ok: [], failedIds: [] };
			const okById = new Map(current.ok.map((item) => [item.id, item]));
			for (const item of ok) okById.set(item.id, item);
			const failed = new Set(current.failedIds);
			for (const id of failedIds) failed.add(id);
			for (const item of ok) failed.delete(item.id);
			pendingDrmPatchRef.current = {
				ok: [...okById.values()],
				failedIds: [...failed],
			};

			if (scrollingRef.current) return;
			if (drmFlushTimerRef.current != null) return;
			drmFlushTimerRef.current = window.setTimeout(() => {
				drmFlushTimerRef.current = null;
				flushDrmPatches();
			}, 350);
		},
		[flushDrmPatches]
	);

	const loadCatalog = useCallback(
		async (keyword?: string) => {
			const api = getUdeler();
			if (!api) return;
			onBusy(true, t("Loading"));
			setMessage("");
			try {
				drmFailedRef.current = new Set();
				drmDoneIdsRef.current = new Set();
				pendingDrmPatchRef.current = null;
				const payload = keyword?.trim()
					? await api.courses.search(keyword.trim())
					: await api.courses.fetch();
				const { courses, next } = normalizeList(payload as CoursesResponse);
				const withDrm = applyDrmCache(courses);
				for (const course of withDrm) {
					if (course.drmChecked) drmDoneIdsRef.current.add(String(course.id));
				}
				setCatalog(withDrm);
				catalogRef.current = withDrm;
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
		[applyDrmCache, onBusy, t]
	);

	const scanCatalogDrm = useCallback(async () => {
		const api = getUdeler();
		if (!api?.courses.scanDrm) return;

		const CONCURRENCY = 2;
		const MAX_ATTEMPTS = 3;
		const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

		const scanWithRetry = async (course: CourseCardModel): Promise<DrmScanOk | null> => {
			let lastError: unknown = null;
			for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
				try {
					const scan = await api.courses.scanDrm(course.id);
					return {
						id: String(course.id),
						encryptedVideos: scan.encryptedVideos,
						videoCount: scan.videoCount,
					};
				} catch (err) {
					lastError = err;
					const message = err instanceof Error ? err.message : String(err);
					const isTimeout = /timeout|ETIMEDOUT/i.test(message);
					if (!isTimeout || attempt === MAX_ATTEMPTS) break;
					await sleep(600 * attempt);
				}
			}
			const detail = lastError instanceof Error ? lastError.message : String(lastError);
			api.logs.append(`DRM scan failed: ${course.title}`, detail);
			return null;
		};

		for (;;) {
			const pending = catalogRef.current.filter((course) => {
				const id = String(course.id);
				if (course.drmChecked || drmDoneIdsRef.current.has(id)) return false;
				if (drmFailedRef.current.has(id)) return false;
				return true;
			});
			if (pending.length === 0) break;

			const batch = pending.slice(0, CONCURRENCY);
			batch.forEach((course) => drmDoneIdsRef.current.add(String(course.id)));

			const results = await Promise.all(batch.map((course) => scanWithRetry(course)));

			const failedCourses = batch.filter((_, index) => results[index] == null);
			failedCourses.forEach((course) => drmFailedRef.current.add(String(course.id)));

			const okResults = results.filter((r): r is DrmScanOk => r != null);
			queueDrmPatches(
				okResults,
				failedCourses.map((course) => String(course.id))
			);

			await sleep(scrollingRef.current ? 140 : 50);

			if (okResults.length === 0 && failedCourses.length === batch.length) {
				break;
			}
		}

		flushDrmPatches();
	}, [flushDrmPatches, queueDrmPatches]);

	const ensureDrmScan = useCallback(async () => {
		if (scanningDrmRef.current) {
			drmRescanRequestedRef.current = true;
			return;
		}
		scanningDrmRef.current = true;
		try {
			do {
				drmRescanRequestedRef.current = false;
				await scanCatalogDrm();
			} while (
				drmRescanRequestedRef.current ||
				catalogRef.current.some((course) => {
					const id = String(course.id);
					return (
						!course.drmChecked &&
						!drmDoneIdsRef.current.has(id) &&
						!drmFailedRef.current.has(id)
					);
				})
			);
		} finally {
			scanningDrmRef.current = false;
		}
	}, [scanCatalogDrm]);

	const pendingDrmCount = useMemo(
		() =>
			catalog.filter((course) => {
				const id = String(course.id);
				return (
					!course.drmChecked &&
					!drmDoneIdsRef.current.has(id) &&
					!drmFailedRef.current.has(id)
				);
			}).length,
		[catalog]
	);

	useEffect(() => {
		void loadCatalog();
		refreshDownloads();
	}, [loadCatalog, refreshDownloads]);

	useEffect(() => {
		catalogRef.current = catalog;
	}, [catalog]);

	useEffect(() => {
		if (tab !== "catalog" || pendingDrmCount === 0) return;
		void ensureDrmScan();
	}, [pendingDrmCount, ensureDrmScan, tab]);

	useEffect(() => {
		const main = document.querySelector("main.ud-main");
		if (!main) return;

		const onScroll = () => {
			scrollingRef.current = true;
			if (scrollIdleTimerRef.current != null) {
				window.clearTimeout(scrollIdleTimerRef.current);
			}
			scrollIdleTimerRef.current = window.setTimeout(() => {
				scrollingRef.current = false;
				scrollIdleTimerRef.current = null;
				flushDrmPatches();
			}, 180);
		};

		main.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			main.removeEventListener("scroll", onScroll);
			if (scrollIdleTimerRef.current != null) {
				window.clearTimeout(scrollIdleTimerRef.current);
			}
			if (drmFlushTimerRef.current != null) {
				window.clearTimeout(drmFlushTimerRef.current);
			}
		};
	}, [flushDrmPatches]);

	useEffect(() => {
		const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 400);
		return () => window.clearTimeout(timer);
	}, [query]);

	useEffect(() => {
		if (tab !== "catalog") return;
		if (skipSearchEffect.current) {
			skipSearchEffect.current = false;
			return;
		}
		void loadCatalog(debouncedQuery || undefined);
	}, [debouncedQuery, tab, loadCatalog]);

	useEffect(() => {
		const api = getUdeler();
		if (!api) return;
		return api.downloads.onEvent((event, payload) => {
			const courseId = String(payload.courseId);
			setProgressMap((prev) => {
				const current = { ...(prev[courseId] || {}), active: true, error: false };
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
						if (payload.action === "reset") {
							current.combinedProgress = 0;
							current.combinedDone = 0;
							if (typeof payload.total === "number" && payload.total > 0) {
								current.combinedTotal = payload.total;
							}
						} else if (payload.action === "increment") {
							const total = current.combinedTotal || 1;
							const done = Math.min(total, (current.combinedDone || 0) + 1);
							current.combinedDone = done;
							current.combinedProgress = Math.round((done / total) * 100);
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
							current.error = false;
						}
						if (event === "error" || event === "encrypted-stop") {
							current.error = true;
							current.progressStatus = t("Download Failed");
						}
						break;
					default:
						break;
				}

				if (event === "complete") {
					const pathDownloaded =
						(typeof payload.downloadPath === "string"
							? payload.downloadPath
							: undefined) || current.pathDownloaded;
					window.setTimeout(() => {
						persistDownloadedCourse(courseId, {
							completed: true,
							pathDownloaded,
							individualProgress: 100,
							combinedProgress: 100,
							progressStatus: t("Completed"),
						});
					}, 0);
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
	}, [onQueueChange, persistDownloadedCourse, refreshDownloads, t]);

	const loadMore = async () => {
		const api = getUdeler();
		if (!api || !nextUrl) return;
		onBusy(true, t("Loading"));
		try {
			const payload = await api.courses.loadMore(nextUrl);
			const { courses, next } = normalizeList(payload);
			const withCache = applyDrmCache(courses);
			for (const course of withCache) {
				if (course.drmChecked) drmDoneIdsRef.current.add(String(course.id));
			}
			setCatalog((prev) => {
				const nextList = [...prev, ...withCache];
				catalogRef.current = nextList;
				return nextList;
			});
			setNextUrl(next);
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			api.logs.append("Load more failed", detail);
		} finally {
			onBusy(false);
		}
	};

	const openPlannerForCourse = async (course: CourseCardModel) => {
		const api = getUdeler();
		if (!api) return null;
		const content = await api.courses.fetchContent(course.id, {
			name: course.title,
			url: course.url,
			instructor: course.instructor,
		});
		return asPlannerCourse(content, course.title);
	};

	const startDownload = async (course: CourseCardModel) => {
		const api = getUdeler();
		if (!api) return;
		onBusy(true, t("Loading"));
		try {
			const planner = await openPlannerForCourse(course);
			if (!planner) {
				api.dialog.showErrorBox(t("Error"), t("Course not found"));
				return;
			}
			const encryptedVideos = Number(planner.encryptedVideos) || 0;
			const videoCount = Number(planner.videoCount) || 0;
			setCatalog((prev) => {
				const next = prev.map((item) =>
					String(item.id) === String(course.id)
						? {
								...item,
								encryptedVideos,
								videoCount,
								drmChecked: true,
							}
						: item
				);
				catalogRef.current = next;
				drmDoneIdsRef.current.add(String(course.id));
				return next;
			});
			setPendingCourseId(course.id);
			setPlannerCourse(planner);
			setPlannerPath(
				course.pathDownloaded ||
					libraryIndex[String(course.id)]?.path ||
					progressMap[String(course.id)]?.pathDownloaded ||
					""
			);
			setPlannerOpen(true);
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			api.dialog.showErrorBox(t("Error"), detail);
			api.logs.append("fetchContent failed", detail);
		} finally {
			onBusy(false);
		}
	};

	const enqueueFilteredCourse = (
		courseId: string | number,
		courseData: unknown,
		meta?: { title?: string; image?: string; url?: string; instructor?: string }
	): "started" | "queued" | "duplicate" => {
		const api = getUdeler();
		if (!api) return "duplicate";
		const snapshot = api.settings.getSnapshot();
		const subtitle =
			typeof snapshot.download.defaultSubtitle === "string"
				? snapshot.download.defaultSubtitle
				: undefined;
		const result = api.downloads.enqueue(courseId, courseData, subtitle, meta);
		setProgressMap((prev) => ({
			...prev,
			[String(courseId)]: {
				...(prev[String(courseId)] || {}),
				active: result !== "duplicate",
				paused: false,
				error: false,
				progressStatus: result === "queued" ? t("queued") : t("Download"),
			},
		}));
		return result;
	};

	const confirmPlanner = (filtered: unknown) => {
		if (pendingCourseId == null) {
			setPlannerOpen(false);
			return;
		}
		const course =
			catalog.find((c) => String(c.id) === String(pendingCourseId)) ||
			downloads.find((c) => String(c.id) === String(pendingCourseId));
		const result = enqueueFilteredCourse(pendingCourseId, filtered, {
			title: course?.title,
			image: course?.image,
			url: course?.url,
			instructor: course?.instructor,
		});
		setPlannerOpen(false);
		setPlannerCourse(null);
		setPlannerPath("");
		setPendingCourseId(null);
		refreshDownloads();
		onQueueChange();
		if (result === "duplicate") {
			setMessage(t("Already in queue"));
		}
	};

	const downloadSelected = async () => {
		const api = getUdeler();
		if (!api || selectedIds.size === 0) return;
		const targets = catalog.filter((c) => selectedIds.has(String(c.id)));
		if (targets.length === 0) return;

		onBusy(true, t("Building Course Data"));
		setMessage("");
		let queued = 0;
		let failed = 0;

		try {
			for (const course of targets) {
				try {
					const planner = await openPlannerForCourse(course);
					if (!planner) {
						failed += 1;
						continue;
					}
					const keys: string[] = [];
					(planner.chapters || []).forEach((chapter, ci) => {
						(chapter.lectures || []).forEach((lecture, li) => {
							if (!lecture.isEncrypted) keys.push(`${ci}:${li}`);
						});
					});
					const filtered = api.planner.filterCourse(planner, keys);
					const result = enqueueFilteredCourse(course.id, filtered, {
						title: course.title,
						image: course.image,
						url: course.url,
						instructor: course.instructor,
					});
					if (result === "duplicate") failed += 1;
					else queued += 1;
				} catch (err) {
					failed += 1;
					const detail = err instanceof Error ? err.message : String(err);
					api.logs.append(`Batch download failed: ${course.title}`, detail);
				}
			}
			setSelectedIds(new Set());
			refreshDownloads();
			onQueueChange();
			setMessage(
				`${t("Queue")}: ${queued}${failed > 0 ? ` · ${t("Error")}: ${failed}` : ""}`
			);
		} finally {
			onBusy(false);
		}
	};

	const openFolder = async (course: CourseCardModel) => {
		const api = getUdeler();
		const path =
			progressMap[String(course.id)]?.pathDownloaded ||
			course.pathDownloaded ||
			libraryIndex[String(course.id)]?.path;
		if (!api || !path) return;
		await api.shell.openPath(path);
	};

	const retryFailedCourse = async (course: CourseCardModel) => {
		const api = getUdeler();
		if (!api) return;
		onBusy(true, t("Retrying failed lessons"));
		try {
			const path =
				course.pathDownloaded ||
				libraryIndex[String(course.id)]?.path ||
				progressMap[String(course.id)]?.pathDownloaded;
			const result = await api.downloads.retryBroken(course.id, {
				name: course.title,
				path,
				image: course.image,
				url: course.url,
			});
			if (result.count === 0) {
				setMessage(t("No broken lessons to retry"));
			} else {
				setMessage(`${t("Retrying failed lessons")}: ${result.count}`);
				setProgressMap((prev) => ({
					...prev,
					[String(course.id)]: {
						...(prev[String(course.id)] || {}),
						active: true,
						error: false,
						progressStatus: t("queued"),
					},
				}));
			}
			refreshDownloads();
			onQueueChange();
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			api.dialog.showErrorBox(t("Error"), detail);
		} finally {
			onBusy(false);
		}
	};

	const retryAllFailed = async () => {
		const targets = downloads.filter((course) => {
			const progress = progressMap[String(course.id)];
			const lib = libraryIndex[String(course.id)];
			if (progress?.error) return true;
			if (lib && !lib.exists) return true;
			if (lib && lib.completed === false) return true;
			const combined = progress?.combinedProgress ?? course.combinedProgress ?? 0;
			if (course.pathDownloaded && combined > 0 && combined < 100) return true;
			return Boolean(course.encryptedVideos && course.encryptedVideos > 0 && !course.completed);
		});
		if (targets.length === 0) {
			setMessage(t("No broken lessons to retry"));
			return;
		}
		for (const course of targets) {
			await retryFailedCourse(course);
		}
	};

	const baseList = useMemo(
		() => (tab === "catalog" ? catalog : downloads),
		[tab, catalog, downloads]
	);

	const statusMap = useMemo(() => {
		const api = getUdeler();
		const map: Record<string, CourseLocalStatus> = {};
		for (const course of baseList) {
			map[String(course.id)] = resolveLocalStatus(
				course,
				progressMap[String(course.id)],
				libraryIndex[String(course.id)],
				api
			);
		}
		return map;
	}, [baseList, libraryIndex, progressMap]);

	const list = useMemo(() => {
		let next = [...baseList];

		next = next.filter((course) => {
			const status = statusMap[String(course.id)] || "idle";
			const encrypted = Number(course.encryptedVideos || 0);
			switch (filter) {
				case "notDownloaded":
					return status === "idle" || status === "missing" || status === "error";
				case "downloaded":
					return status === "downloaded" || status === "partial";
				case "drm":
					return Boolean(course.drmChecked) && encrypted > 0;
				case "noDrm":
					return Boolean(course.drmChecked) && encrypted === 0;
				default:
					return true;
			}
		});

		if (sort === "az") {
			next.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
		} else if (sort === "notDownloadedFirst") {
			const rank = (status: CourseLocalStatus) => {
				if (status === "idle" || status === "error" || status === "missing") return 0;
				if (status === "queued" || status === "downloading" || status === "paused") return 1;
				if (status === "partial") return 2;
				return 3;
			};
			next.sort((a, b) => {
				const diff =
					rank(statusMap[String(a.id)] || "idle") - rank(statusMap[String(b.id)] || "idle");
				if (diff !== 0) return diff;
				return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
			});
		}

		return next;
	}, [baseList, filter, sort, statusMap]);

	const displayCourses = useMemo(() => {
		return list.map((course) => {
			const id = String(course.id);
			const lib = libraryIndex[id];
			const prog = progressMap[id];
			const pathDownloaded =
				prog?.pathDownloaded || course.pathDownloaded || lib?.path;
			const encryptedVideos = Math.max(
				Number(course.encryptedVideos || 0),
				Number(lib?.encryptedVideos || 0)
			);
			const completed = Boolean(course.completed || lib?.completed);

			if (
				pathDownloaded === course.pathDownloaded &&
				encryptedVideos === Number(course.encryptedVideos || 0) &&
				completed === Boolean(course.completed)
			) {
				return course;
			}

			return {
				...course,
				pathDownloaded,
				encryptedVideos,
				completed,
			};
		});
	}, [list, libraryIndex, progressMap]);

	const actionsRef = useRef({
		tab,
		startDownload,
		retryFailedCourse,
		openFolder,
	});
	actionsRef.current = { tab, startDownload, retryFailedCourse, openFolder };

	const onSelectChangeStable = useCallback((c: CourseCardModel, checked: boolean) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			const id = String(c.id);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	}, []);

	const onCancelStable = useCallback(
		(c: CourseCardModel) => {
			getUdeler()?.downloads.cancel(c.id);
			setProgressMap((prev) => ({
				...prev,
				[String(c.id)]: {
					...(prev[String(c.id)] || {}),
					active: false,
					paused: false,
				},
			}));
			onQueueChange();
		},
		[onQueueChange]
	);

	const onPauseStable = useCallback((c: CourseCardModel) => {
		getUdeler()?.downloads.pause(c.id);
	}, []);

	const onResumeStable = useCallback((c: CourseCardModel) => {
		getUdeler()?.downloads.resume(c.id);
	}, []);

	const onOpenFolderStable = useCallback((c: CourseCardModel) => {
		void actionsRef.current.openFolder(c);
	}, []);

	const onDownloadStable = useCallback((c: CourseCardModel) => {
		const { tab: currentTab, startDownload: download, retryFailedCourse: retry } =
			actionsRef.current;
		if (currentTab === "catalog") void download(c);
		else if (currentTab === "downloads") void retry(c);
	}, []);

	const allVisibleSelected =
		list.length > 0 && list.every((course) => selectedIds.has(String(course.id)));

	const toggleSelectAll = (checked: boolean) => {
		if (!checked) {
			setSelectedIds(new Set());
			return;
		}
		setSelectedIds(new Set(list.map((course) => String(course.id))));
	};

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
						onClick={() => {
							setTab(item.id);
							setSelectedIds(new Set());
						}}
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
				<div className="space-y-3">
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
						{query && (
							<button
								type="button"
								onClick={() => setQuery("")}
								className="rounded-lg border border-ud-border px-3 py-2 text-sm hover:bg-ud-muted"
							>
								{t("Clear")}
							</button>
						)}
						<button
							type="submit"
							className="rounded-lg bg-ud-accent px-4 py-2 text-sm font-medium text-white hover:bg-ud-accent-hover"
						>
							{t("Search")}
						</button>
					</form>

					<div className="flex flex-wrap items-center gap-2">
						<select
							value={filter}
							onChange={(e) => setFilter(e.target.value as CourseFilter)}
							className="rounded-lg border border-ud-border bg-ud-elevated px-3 py-2 text-sm"
							aria-label={t("Filter")}
						>
							<option value="all">{t("All courses")}</option>
							<option value="notDownloaded">{t("Not downloaded")}</option>
							<option value="downloaded">{t("Downloaded")}</option>
							<option value="drm">{t("With DRM")}</option>
							<option value="noDrm">{t("No DRM")}</option>
						</select>
						<select
							value={sort}
							onChange={(e) => setSort(e.target.value as CourseSort)}
							className="rounded-lg border border-ud-border bg-ud-elevated px-3 py-2 text-sm"
							aria-label={t("Sort")}
						>
							<option value="recent">{t("Recently accessed")}</option>
							<option value="az">{t("Name A-Z")}</option>
							<option value="notDownloadedFirst">{t("Not downloaded first")}</option>
						</select>
						<span className="text-xs text-ud-text-muted">
							{list.length} {t("Courses").toLowerCase()}
						</span>
					</div>

					<div className="flex flex-wrap items-center gap-3 rounded-xl border border-ud-border bg-ud-elevated px-3 py-2">
						<label className="flex items-center gap-2 text-sm text-ud-text-muted">
							<input
								type="checkbox"
								checked={allVisibleSelected}
								onChange={(e) => toggleSelectAll(e.target.checked)}
							/>
							{t("Select all")}
						</label>
						<button
							type="button"
							disabled={selectedIds.size === 0}
							onClick={() => void downloadSelected()}
							className="rounded-lg bg-ud-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-ud-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
						>
							{t("Download selected")} ({selectedIds.size})
						</button>
					</div>
				</div>
			)}

			{tab === "downloads" && (
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="text-sm text-ud-text-muted">
						{t("Downloads in this session and previous ones")}
					</p>
					<button
						type="button"
						onClick={() => void retryAllFailed()}
						className="rounded-lg border border-ud-warning/40 px-3 py-1.5 text-xs text-ud-warning hover:bg-ud-warning/10"
					>
						{t("Retry failed")}
					</button>
				</div>
			)}

			{message && <p className="text-sm text-ud-warning">{message}</p>}

			<div className="space-y-3">
				{list.length === 0 ? (
					<p className="rounded-xl border border-dashed border-ud-border px-4 py-8 text-center text-sm text-ud-text-muted">
						{tab === "downloads"
							? t("There are no Downloads to display")
							: query
								? t("No search results")
								: t("No Courses Found")}
					</p>
				) : (
					displayCourses.map((course) => (
						<CourseCard
							key={String(course.id)}
							course={course}
							progress={progressMap[String(course.id)]}
							status={statusMap[String(course.id)] || "idle"}
							selectable={tab === "catalog"}
							selected={selectedIds.has(String(course.id))}
							onSelectChange={onSelectChangeStable}
							onDownload={
								tab === "catalog" || tab === "downloads" ? onDownloadStable : undefined
							}
							onDetails={undefined}
							onCancel={onCancelStable}
							onPause={onPauseStable}
							onResume={onResumeStable}
							onOpenFolder={onOpenFolderStable}
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
				coursePath={plannerPath}
				onCancel={() => {
					setPlannerOpen(false);
					setPlannerCourse(null);
					setPlannerPath("");
					setPendingCourseId(null);
				}}
				onConfirm={(filtered) => confirmPlanner(filtered)}
			/>
		</div>
	);
}

export type NavSection = "courses" | "library" | "dashboard" | "settings" | "logger" | "about";

export type CoursesTab = "catalog" | "downloads";

export interface SessionUser {
	id?: string | number;
	name: string;
	email?: string;
	image?: string;
}

export interface CourseCard {
	id: string | number;
	title: string;
	url?: string;
	image?: string;
	completed?: boolean;
	encryptedVideos?: number;
	pathDownloaded?: string;
	individualProgress?: number;
	combinedProgress?: number;
	progressStatus?: string;
	selectedSubtitle?: string;
	lectureCount?: number;
	duration?: string;
	instructor?: string;
	completionRatio?: number;
	lastAccessed?: string;
	drmChecked?: boolean;
	drmFailed?: boolean;
	videoCount?: number;
}

export type CourseLocalStatus =
	| "idle"
	| "queued"
	| "downloading"
	| "paused"
	| "downloaded"
	| "partial"
	| "error"
	| "missing";

export interface DownloadEventPayload {
	courseId: string;
	[key: string]: unknown;
}

export interface AppSettingsSnapshot {
	language: string;
	theme: "dark" | "light";
	subDomain: string;
	accessToken: string | null;
	clientId: string | null;
	subscriber: boolean;
	sessionUser: SessionUser | null;
	download: Record<string, unknown>;
	downloadHistory: unknown[];
	downloadedCourses: unknown[];
	pendingDownloads: unknown[];
	notificationsEnabled: boolean;
	uiDensity: "compact" | "comfortable";
	downloadPath: string;
}

export interface DashboardSnapshot {
	downloadPath: string;
	disk: {
		freeBytes: number;
		totalBytes: number;
		usedBytes: number;
		libraryBytes: number;
	};
	queue: { running: number; pending: number; concurrency: number };
	active: Array<{
		courseId: string;
		title: string;
		progress: number;
		speedBps: number;
		etaSeconds: number | null;
		path: string;
		active: boolean;
	}>;
	courses: Array<{
		id: string;
		name: string;
		path: string;
		progress: number;
		sizeBytes: number;
		completed: boolean;
		exists: boolean;
		brokenCount: number;
	}>;
}

export interface LogEntry {
	title: string;
	detail: string;
	at: string;
	level?: string;
	category?: string;
}

export interface MediaListItem {
	path: string;
	name: string;
	url: string;
	sizeBytes: number;
	ok: boolean;
}

export interface LibraryListItem {
	id: string;
	name: string;
	path: string;
	completed: boolean;
	encryptedVideos: number;
	image: string;
	exists: boolean;
	modifiedAt: number;
	sizeBytes: number;
	downloadedAt: string | null;
	brokenCount: number;
	okMediaCount: number;
}

export interface IntegrityReport {
	path: string;
	ok: number;
	broken: number;
	missingExpected?: number;
	totalSizeBytes: number;
	files: Array<{
		relativePath: string;
		absolutePath: string;
		sizeBytes: number;
		ok: boolean;
		reason?: string;
	}>;
}

export type PlannerSelectMode = "all" | "videos" | "missing" | "new";

export interface UdelerBridge {
	versions: { electron: string; chrome: string; node: string };
	env: {
		debugMode: boolean;
		isPackage: boolean;
		sentryDsn: string;
		userDataPath: string;
		appVersion: string;
		urlHelp: string;
	};
	shell: {
		openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
		openPath: (target: string) => Promise<{ ok: boolean; error: string | null }>;
	};
	dialog: {
		selectDirectory: () => Promise<string | null>;
		showSaveDialog: (options?: Record<string, unknown>) => Promise<{ canceled: boolean; filePath?: string }>;
		showErrorBox: (title: string, message: string) => void;
	};
	auth: {
		openUdemyLogin: (payload?: { subdomain?: string }) => Promise<{
			accessToken: string;
			clientId: string | null;
			subDomain: string;
		} | null>;
		loginWithToken: (token: string, subdomain: string) => Promise<SessionUser | null>;
		logout: () => void;
		checkSession: () => Promise<{ ok: boolean; user: SessionUser | null; error?: string }>;
	};
	settings: {
		getSnapshot: () => AppSettingsSnapshot;
		save: (
			partial: Partial<AppSettingsSnapshot> & { download?: Record<string, unknown> }
		) => AppSettingsSnapshot;
		setTheme: (theme: "dark" | "light") => void;
		setDensity?: (density: "compact" | "comfortable") => void;
	};
	i18n: {
		translate: (key: string) => string;
		getLanguage: () => string;
		getLanguages: () => string[];
	};
	courses: {
		fetch: (pageSize?: number) => Promise<unknown>;
		search: (keyword: string, pageSize?: number) => Promise<unknown>;
		loadMore: (url: string) => Promise<unknown>;
		fetchContent: (
			courseId: string | number,
			meta?: { name?: string; title?: string; url?: string; instructor?: string }
		) => Promise<unknown>;
		scanDrm: (courseId: string | number) => Promise<{
			encryptedVideos: number;
			videoCount: number;
			totalLectures: number;
			checkedAt: number;
		}>;
		getDrmCache: () => Record<
			string,
			{ encryptedVideos: number; videoCount: number; totalLectures: number; checkedAt: number }
		>;
		clearDrmCache: () => void;
	};
	downloads: {
		enqueue: (
			courseId: string | number,
			courseData: unknown,
			subtitle?: string,
			meta?: { title?: string; image?: string; url?: string; instructor?: string }
		) => "started" | "queued" | "duplicate";
		cancel: (courseId: string | number) => void;
		pause: (courseId: string | number) => void;
		resume: (courseId: string | number) => void;
		getQueueStatus: () => { running: number; pending: number; concurrency: number };
		isQueued: (courseId: string | number) => boolean;
		isDownloading: (courseId: string | number) => boolean;
		isActive: (courseId: string | number) => boolean;
		onEvent: (handler: (event: string, payload: DownloadEventPayload) => void) => () => void;
		saveHistory: () => void;
		getDownloadedCourses: () => CourseCard[];
		getPendingDownloads: () => unknown[];
		restoreQueue: () => { restored: number };
		retryBroken: (
			courseId: string | number,
			meta?: {
				name?: string;
				title?: string;
				url?: string;
				path?: string;
				image?: string;
				instructor?: string;
			}
		) => Promise<{ status: string; count: number }>;
	};
	library: {
		list: (options?: { scanIntegrity?: boolean }) => LibraryListItem[];
		remove: (id: string, folderPath: string) => boolean;
		verify: (folderPath: string) => IntegrityReport;
		removeBroken: (folderPath: string) => { removed: number; report: IntegrityReport };
		formatSize: (bytes: number) => string;
		exportIndex: (
			folderPath: string,
			courseData?: { name?: string; chapters?: unknown[] } | null
		) => { dir: string; files: string[]; name?: string };
		resolvePath: (
			courseName: string,
			instructor?: string
		) => { coursePath: string; relativeSegments: string[]; layout: string };
	};
	planner: {
		filterCourse: (courseData: unknown, selectedKeys: string[]) => unknown;
		stats: (courseData: unknown) => { total: number; encrypted: number; percent: number };
		selectKeys: (courseData: unknown, mode: PlannerSelectMode, coursePath?: string) => string[];
		analyzeDisk: (
			courseData: unknown,
			coursePath?: string
		) => {
			missingKeys: string[];
			videoKeys: string[];
			presentKeys: string[];
			brokenPaths: string[];
		};
	};
	notify: {
		show: (title: string, body: string) => void;
		isEnabled: () => boolean;
		setEnabled: (value: boolean) => void;
	};
	app: {
		quit: () => void;
		onSaveDownloads: (cb: () => void) => () => void;
	};
	logs: {
		list: (filter?: {
			level?: string;
			category?: string;
			query?: string;
		}) => LogEntry[];
		clear: () => void;
		append: (title: string, detail?: unknown, meta?: { level?: string; category?: string }) => void;
		export: () => Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
	};
	media: {
		toUrl: (filePath: string) => string;
		listInFolder: (folderPath: string) => MediaListItem[];
	};
	dashboard: {
		getSnapshot: () => DashboardSnapshot;
	};
}

declare global {
	interface Window {
		udeler: UdelerBridge;
	}
}

export {};

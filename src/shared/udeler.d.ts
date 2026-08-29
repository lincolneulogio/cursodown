export type NavSection = "courses" | "library" | "settings" | "logger" | "about";

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
}

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
	downloadPath: string;
}

export interface UdelerBridge {
	versions: { electron: string; chrome: string; node: string };
	env: {
		debugMode: boolean;
		isPackage: boolean;
		sentryDsn: string;
		userDataPath: string;
		appVersion: string;
		urlHelp: string;
		urlDonate: string;
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
		save: (partial: Partial<AppSettingsSnapshot> & { download?: Record<string, unknown> }) => AppSettingsSnapshot;
		setTheme: (theme: "dark" | "light") => void;
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
		fetchContent: (courseId: string | number) => Promise<unknown>;
	};
	downloads: {
		enqueue: (courseId: string | number, courseData: unknown, subtitle?: string) => "started" | "queued" | "duplicate";
		cancel: (courseId: string | number) => void;
		pause: (courseId: string | number) => void;
		resume: (courseId: string | number) => void;
		getQueueStatus: () => { running: number; pending: number; concurrency: number };
		onEvent: (handler: (event: string, payload: DownloadEventPayload) => void) => () => void;
		saveHistory: () => void;
		getDownloadedCourses: () => CourseCard[];
	};
	library: {
		list: () => Array<{
			id: string;
			name: string;
			path: string;
			completed: boolean;
			encryptedVideos: number;
			image: string;
			exists: boolean;
			modifiedAt: number;
		}>;
		remove: (id: string, folderPath: string) => boolean;
	};
	planner: {
		filterCourse: (courseData: unknown, selectedKeys: string[]) => unknown;
		stats: (courseData: unknown) => { total: number; encrypted: number; percent: number };
	};
	app: {
		quit: () => void;
		onSaveDownloads: (cb: () => void) => () => void;
	};
	logs: {
		list: () => Array<{ title: string; detail: string; at: string }>;
		clear: () => void;
		append: (title: string, detail?: unknown) => void;
	};
}

declare global {
	interface Window {
		udeler: UdelerBridge;
	}
}

export {};

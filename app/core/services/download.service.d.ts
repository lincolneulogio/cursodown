import { EventEmitter } from "events";
import type { CourseData, SettingsLike, SpeedInfo } from "./types";

export interface DownloadServiceDeps {
	settings: SettingsLike;
	utils: {
		getSequenceName: (...args: any[]) => { name: string; fullPath: string };
		getDownloadSpeed: (bytesPerSecond: number) => SpeedInfo;
		dynamicSort: (property: string) => (a: any, b: any) => number;
	};
	translate: (key: string) => string;
	httpTimeout?: number;
	captureException?: (error: Error) => void;
}

export interface CourseDownloadSession {
	courseId: string;
	start(): void;
	abort(): void;
	pause(isEncrypted?: boolean): void;
	resume(): void;
}

declare class DownloadService extends EventEmitter {
	constructor(deps: DownloadServiceDeps);
	start(courseId: string | number, courseData: CourseData, subTitle?: string | string[]): CourseDownloadSession;
	pause(courseId: string | number): void;
	resume(courseId: string | number): void;
	cancel(courseId: string | number): void;
	complete(courseId: string | number): void;
	isActive(courseId: string | number): boolean;
	static shouldSkipExistingFile(filePath: string, skipExisting?: boolean): boolean;
	static hasDRMProtection(dl: { url?: string }): boolean;
	static readonly labelColorMap: Readonly<Record<string | number, string>>;
}

export = DownloadService;

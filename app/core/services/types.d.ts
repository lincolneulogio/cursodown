/**
 * Shared domain models for CursoDown core.
 */
export interface SpeedInfo {
    value: number;
    unit: string;
}
export interface M3U8Variant {
    quality: number;
    resolution: string;
    url: string;
}
export interface CourseLecture {
    id?: string | number;
    name: string;
    type: string;
    src?: string;
    quality?: string | number;
    isEncrypted?: boolean;
    subtitles?: Record<string, string>;
    attachments?: CourseAttachment[];
}
export interface CourseAttachment {
    name: string;
    type: string;
    src: string;
    quality?: string | number;
}
export interface CourseChapter {
    name: string;
    lectures: CourseLecture[];
}
export interface CourseData {
    id?: string | number;
    name: string;
    totalLectures: number;
    encryptedVideos?: number;
    errorCount?: number;
    chapters: CourseChapter[];
    availableSubs?: Record<string, number>;
}
export interface LibraryItem {
    id: string;
    name: string;
    path: string;
    completed: boolean;
    encryptedVideos: number;
    image: string;
    exists: boolean;
    modifiedAt: number;
}
export interface DownloadHistoryEntry {
    id: string | number;
    name?: string;
    completed?: boolean;
    encryptedVideos?: number;
    selectedSubtitle?: string;
    pathDownloaded?: string;
    date?: string;
}
export interface DownloadedCourseEntry {
    id: string | number;
    title?: string;
    name?: string;
    url?: string;
    image?: string;
    completed?: boolean;
    encryptedVideos?: number;
    selectedSubtitle?: string;
    pathDownloaded?: string;
    individualProgress?: number;
    combinedProgress?: number;
    progressStatus?: string;
}
export type DownloadQueueStatus = "started" | "queued" | "duplicate";
export interface DownloadSettingsSlice {
    enableDownloadStartEnd?: boolean;
    downloadStart?: number;
    downloadEnd?: number;
    skipExistingFiles?: boolean;
    autoRetry?: boolean;
    continueDonwloadingEncrypted?: boolean;
    type?: number;
    maxConcurrentDownloads?: number;
    skipSubtitles?: boolean;
    defaultSubtitle?: string;
    videoQuality?: string;
}
export interface SettingsLike {
    DownloadType: {
        Both: number;
        OnlyLectures: number;
        OnlyAttachments: number;
    };
    download: DownloadSettingsSlice;
    downloadDirectory: (courseName?: string) => string;
}
//# sourceMappingURL=types.d.ts.map
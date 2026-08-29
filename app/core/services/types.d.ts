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
    /** Folder size in bytes (0 if missing). */
    sizeBytes: number;
    /** ISO date when the course was last completed/saved. */
    downloadedAt: string | null;
    /** Media files that exist but are empty/invalid. */
    brokenCount: number;
    /** Playable media files found on disk. */
    okMediaCount: number;
    instructor?: string;
    duration?: string;
    /** Official lecture count from Udemy / course-meta (not disk media count). */
    lectureCount?: number;
}
export interface DownloadHistoryEntry {
    id: string | number;
    name?: string;
    completed?: boolean;
    encryptedVideos?: number;
    selectedSubtitle?: string;
    pathDownloaded?: string;
    date?: string;
    sizeBytes?: number;
    image?: string;
}
export interface PersistentQueueItem {
    courseId: string;
    courseData: CourseData;
    subtitle?: string;
    enqueuedAt: number;
    title?: string;
    image?: string;
    url?: string;
}
export interface IntegrityFileResult {
    relativePath: string;
    absolutePath: string;
    sizeBytes: number;
    ok: boolean;
    reason?: string;
}
export interface IntegrityReport {
    path: string;
    ok: number;
    broken: number;
    missingExpected?: number;
    totalSizeBytes: number;
    files: IntegrityFileResult[];
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
    seqZeroLeft?: boolean;
    bandwidthLimitKbps?: number;
    folderLayout?: "course" | "instructor";
    exportIndexOnComplete?: boolean;
}
export interface SettingsLike {
    DownloadType: {
        Both: number;
        OnlyLectures: number;
        OnlyAttachments: number;
        OnlySubtitles: number;
    };
    download: DownloadSettingsSlice;
    downloadDirectory: (courseName?: string) => string;
}
//# sourceMappingURL=types.d.ts.map
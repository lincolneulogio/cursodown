import type { DownloadHistoryEntry, DownloadedCourseEntry, LibraryItem } from "./types";
/**
 * Builds the local library from download history and folders on disk.
 */
declare class LibraryService {
    static list(rootDir: string, history?: DownloadHistoryEntry[], downloadedCourses?: DownloadedCourseEntry[]): LibraryItem[];
    static removeFolder(rootDir: string, folderPath: string): boolean;
    static forget(item: {
        id: string;
        path?: string;
    }, history?: DownloadHistoryEntry[], downloadedCourses?: DownloadedCourseEntry[]): {
        history: DownloadHistoryEntry[];
        downloadedCourses: DownloadedCourseEntry[];
    };
}
export = LibraryService;
//# sourceMappingURL=library.service.d.ts.map
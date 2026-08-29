import type { IntegrityFileResult, IntegrityReport } from "./types";
/**
 * Scans a course folder for media integrity (empty / HTML / playlist misnamed as video).
 */
declare class IntegrityService {
    static walkMediaFiles(rootDir: string): string[];
    static folderSizeBytes(rootDir: string): number;
    static inspectFile(filePath: string): IntegrityFileResult;
    static verifyFolder(rootDir: string): IntegrityReport;
    /**
     * Deletes broken media so a later download with skipExisting can recreate them.
     */
    static removeBroken(rootDir: string): {
        removed: number;
        report: IntegrityReport;
    };
    static quickBrokenCount(rootDir: string): {
        brokenCount: number;
        okMediaCount: number;
        sizeBytes: number;
    };
}
export = IntegrityService;
//# sourceMappingURL=integrity.service.d.ts.map
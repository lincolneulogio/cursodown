"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const MEDIA_EXT = new Set([".mp4", ".ts", ".mkv", ".webm", ".m4a", ".mp3"]);
function loadMediaHelpers() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const media = require("../../helpers/media-finalize");
    return media;
}
/**
 * Scans a course folder for media integrity (empty / HTML / playlist misnamed as video).
 */
class IntegrityService {
    static walkMediaFiles(rootDir) {
        if (!rootDir || !fs.existsSync(rootDir)) {
            return [];
        }
        const results = [];
        const stack = [rootDir];
        while (stack.length > 0) {
            const current = stack.pop();
            if (!current)
                continue;
            let entries;
            try {
                entries = fs.readdirSync(current, { withFileTypes: true });
            }
            catch {
                continue;
            }
            for (const entry of entries) {
                const full = path.join(current, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === "subs" || entry.name === "node_modules")
                        continue;
                    stack.push(full);
                    continue;
                }
                if (!entry.isFile())
                    continue;
                const ext = path.extname(entry.name).toLowerCase();
                if (MEDIA_EXT.has(ext) || entry.name.toLowerCase().endsWith(".mp4.mtd")) {
                    if (entry.name.toLowerCase().endsWith(".mtd"))
                        continue;
                    results.push(full);
                }
            }
        }
        return results;
    }
    static folderSizeBytes(rootDir) {
        if (!rootDir || !fs.existsSync(rootDir)) {
            return 0;
        }
        let total = 0;
        const stack = [rootDir];
        while (stack.length > 0) {
            const current = stack.pop();
            if (!current)
                continue;
            let entries;
            try {
                entries = fs.readdirSync(current, { withFileTypes: true });
            }
            catch {
                continue;
            }
            for (const entry of entries) {
                const full = path.join(current, entry.name);
                if (entry.isDirectory()) {
                    stack.push(full);
                    continue;
                }
                if (!entry.isFile())
                    continue;
                try {
                    total += fs.statSync(full).size;
                }
                catch {
                    /* ignore */
                }
            }
        }
        return total;
    }
    static inspectFile(filePath) {
        const { detectContainer, isValidMediaFile } = loadMediaHelpers();
        const relativePath = path.basename(filePath);
        try {
            const stat = fs.statSync(filePath);
            if (stat.size === 0) {
                return {
                    relativePath,
                    absolutePath: filePath,
                    sizeBytes: 0,
                    ok: false,
                    reason: "empty",
                };
            }
            const container = detectContainer(filePath);
            const ok = isValidMediaFile(filePath);
            return {
                relativePath,
                absolutePath: filePath,
                sizeBytes: stat.size,
                ok,
                reason: ok ? undefined : container || "invalid",
            };
        }
        catch (error) {
            return {
                relativePath,
                absolutePath: filePath,
                sizeBytes: 0,
                ok: false,
                reason: error instanceof Error ? error.message : "unreadable",
            };
        }
    }
    static verifyFolder(rootDir) {
        const absolute = rootDir ? path.resolve(rootDir) : "";
        const mediaFiles = IntegrityService.walkMediaFiles(absolute);
        const files = mediaFiles.map((file) => {
            const result = IntegrityService.inspectFile(file);
            return {
                ...result,
                relativePath: path.relative(absolute, file).split(path.sep).join("/"),
            };
        });
        const ok = files.filter((f) => f.ok).length;
        const broken = files.filter((f) => !f.ok).length;
        const totalSizeBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);
        return {
            path: absolute,
            ok,
            broken,
            totalSizeBytes,
            files,
        };
    }
    /**
     * Deletes broken media so a later download with skipExisting can recreate them.
     */
    static removeBroken(rootDir) {
        const report = IntegrityService.verifyFolder(rootDir);
        let removed = 0;
        for (const file of report.files) {
            if (file.ok)
                continue;
            try {
                fs.unlinkSync(file.absolutePath);
                removed += 1;
                const mtd = `${file.absolutePath}.mtd`;
                if (fs.existsSync(mtd))
                    fs.unlinkSync(mtd);
            }
            catch {
                /* ignore */
            }
        }
        return { removed, report: IntegrityService.verifyFolder(rootDir) };
    }
    static quickBrokenCount(rootDir) {
        if (!rootDir || !fs.existsSync(rootDir)) {
            return { brokenCount: 0, okMediaCount: 0, sizeBytes: 0 };
        }
        const { isValidMediaFile } = loadMediaHelpers();
        const mediaFiles = IntegrityService.walkMediaFiles(rootDir);
        let brokenCount = 0;
        let okMediaCount = 0;
        let sizeBytes = 0;
        for (const file of mediaFiles) {
            try {
                const size = fs.statSync(file).size;
                sizeBytes += size;
                if (size === 0 || !isValidMediaFile(file))
                    brokenCount += 1;
                else
                    okMediaCount += 1;
            }
            catch {
                brokenCount += 1;
            }
        }
        return { brokenCount, okMediaCount, sizeBytes };
    }
}
module.exports = IntegrityService;
//# sourceMappingURL=integrity.service.js.map
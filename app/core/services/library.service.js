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
/**
 * Builds the local library from download history and folders on disk.
 */
class LibraryService {
    static list(rootDir, history = [], downloadedCourses = []) {
        const byId = new Map();
        (downloadedCourses || []).forEach((course) => {
            if (!course)
                return;
            const id = String(course.id);
            byId.set(id, {
                id,
                name: course.title || course.name || "Course",
                path: course.pathDownloaded || "",
                completed: Boolean(course.completed),
                encryptedVideos: Number(course.encryptedVideos) || 0,
                image: course.image || "",
                exists: false,
                modifiedAt: 0,
            });
        });
        (history || []).forEach((entry) => {
            if (!entry)
                return;
            const id = String(entry.id);
            const current = byId.get(id) || {
                id,
                name: entry.name || "Course",
                path: "",
                completed: false,
                encryptedVideos: 0,
                image: "",
                exists: false,
                modifiedAt: 0,
            };
            current.name = entry.name || current.name;
            current.path = entry.pathDownloaded || current.path;
            current.completed = Boolean(entry.completed) || current.completed;
            current.encryptedVideos = Math.max(current.encryptedVideos, Number(entry.encryptedVideos) || 0);
            byId.set(id, current);
        });
        if (rootDir && fs.existsSync(rootDir)) {
            try {
                fs.readdirSync(rootDir, { withFileTypes: true })
                    .filter((dirent) => dirent.isDirectory())
                    .forEach((dirent) => {
                    const folderPath = path.join(rootDir, dirent.name);
                    const already = [...byId.values()].find((item) => item.path === folderPath);
                    if (already)
                        return;
                    byId.set(`folder:${dirent.name}`, {
                        id: `folder:${dirent.name}`,
                        name: dirent.name,
                        path: folderPath,
                        completed: true,
                        encryptedVideos: 0,
                        image: "",
                        exists: true,
                        modifiedAt: 0,
                    });
                });
            }
            catch (error) {
                console.error("LibraryService.list readdir", error);
            }
        }
        return [...byId.values()]
            .map((item) => {
            const exists = Boolean(item.path && fs.existsSync(item.path));
            let modifiedAt = 0;
            if (exists) {
                try {
                    modifiedAt = fs.statSync(item.path).mtimeMs || 0;
                }
                catch {
                    modifiedAt = 0;
                }
            }
            return { ...item, exists, modifiedAt };
        })
            .sort((a, b) => b.modifiedAt - a.modifiedAt);
    }
    static removeFolder(rootDir, folderPath) {
        if (!rootDir || !folderPath) {
            return false;
        }
        const root = path.resolve(rootDir);
        const target = path.resolve(folderPath);
        const relative = path.relative(root, target);
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
            throw new Error("Path outside library");
        }
        if (!fs.existsSync(target)) {
            return false;
        }
        fs.rmSync(target, { recursive: true, force: true });
        return true;
    }
    static forget(item, history = [], downloadedCourses = []) {
        const id = String(item?.id || "");
        const folder = item?.path ? path.resolve(item.path) : "";
        const matches = (entry) => {
            if (!entry)
                return false;
            if (id && String(entry.id) === id)
                return true;
            if (folder && entry.pathDownloaded && path.resolve(entry.pathDownloaded) === folder)
                return true;
            return false;
        };
        return {
            history: (history || []).filter((entry) => !matches(entry)),
            downloadedCourses: (downloadedCourses || []).filter((entry) => !matches(entry)),
        };
    }
}
module.exports = LibraryService;
//# sourceMappingURL=library.service.js.map
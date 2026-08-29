/**
 * Contracts for window.udeler (preload → renderer).
 * Used by Phase 1 IPC bridge; kept in sync with preload.js.
 */
export interface UdelerFsStat {
    size: number;
    mtimeMs: number;
    isDirectory: boolean;
    isFile: boolean;
}
export interface UdelerFsApi {
    existsSync: (filePath: string) => boolean;
    mkdirSync: (filePath: string, options?: {
        recursive?: boolean;
    }) => void;
    unlinkSync: (filePath: string) => void;
    renameSync: (from: string, to: string) => void;
    statSync: (filePath: string) => UdelerFsStat;
    access: (filePath: string, mode?: number) => Promise<{
        ok: boolean;
        error: string | null;
    }>;
    constants: {
        R_OK: number;
        W_OK: number;
        F_OK: number;
    };
    writeFile: (filePath: string, data: string | Buffer, encoding?: string) => Promise<void>;
    writeFileSync: (filePath: string, data: string | Buffer, encoding?: string) => void;
    appendFileSync: (filePath: string, data: string | Buffer) => void;
    readFileSync: (filePath: string, encoding?: string) => string | Buffer;
    readdirSync: (dirPath: string) => Array<{
        name: string;
        isDirectory: boolean;
        isFile: boolean;
    }>;
    rmSync: (filePath: string, options?: {
        recursive?: boolean;
        force?: boolean;
    }) => void;
    unlink: (filePath: string) => Promise<{
        ok: boolean;
        error: string | null;
    }>;
    downloadUrlToFile: (url: string, filePath: string) => Promise<string>;
}
export interface UdelerPathApi {
    join: (...parts: string[]) => string;
    resolve: (...parts: string[]) => string;
    relative: (from: string, to: string) => string;
    basename: (filePath: string, ext?: string) => string;
    dirname: (filePath: string) => string;
    extname: (filePath: string) => string;
    isAbsolute: (filePath: string) => boolean;
    sep: string;
}
export interface UdemyLoginSession {
    accessToken: string;
    clientId: string | null;
    subDomain: string;
}
export interface SaveDialogOptions {
    title?: string;
    defaultPath?: string;
    filters?: Array<{
        name: string;
        extensions: string[];
    }>;
}
export interface SaveDialogResult {
    canceled: boolean;
    filePath?: string;
}
export interface UdelerApi {
    versions: {
        electron: string;
        chrome: string;
        node: string;
    };
    env: {
        debugMode: boolean;
        isPackage: boolean;
        sentryDsn: string;
        prettifySettings: boolean;
        userDataPath: string;
    };
    path: UdelerPathApi;
    os: {
        homedir: () => string;
        platform: () => NodeJS.Platform;
    };
    fs: UdelerFsApi;
    shell: {
        openExternal: (url: string) => Promise<{
            ok: boolean;
            error?: string;
        }>;
        openPath: (target: string) => Promise<{
            ok: boolean;
            error: string | null;
        }>;
    };
    dialog: {
        selectDirectory: () => Promise<string | null>;
        showSaveDialog: (options?: SaveDialogOptions) => Promise<SaveDialogResult>;
        showErrorBox: (title: string, message: string) => void;
    };
    auth: {
        openUdemyLogin: (payload?: {
            subdomain?: string;
        }) => Promise<UdemyLoginSession | null>;
    };
    app: {
        quit: () => void;
    };
    onSaveDownloads: (callback: () => void) => () => void;
}
declare global {
    interface Window {
        udeler: UdelerApi;
    }
}
export {};
//# sourceMappingURL=ipc.d.ts.map
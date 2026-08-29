import type { M3U8Variant } from "./types";
declare class M3U8Service {
    private _m3u8Url;
    private _playlist;
    constructor(m3u8Url: string);
    private static isValidUrl;
    private _isValidM3U8Content;
    private _extractUrlsAndQualities;
    static getFile(url: string, isBinary?: boolean, maxRetries?: number): Promise<string | ArrayBuffer>;
    loadPlaylist(maxRetries?: number): Promise<M3U8Variant[]>;
    getPlaylist(): M3U8Variant[];
    private _sortPlaylistByQuality;
    getHighestQuality(): M3U8Variant | null;
    getLowestQuality(): M3U8Variant | null;
    /**
     * Resolves a master or media playlist into a flat list of .ts segment URLs.
     */
    static resolveSegmentUrls(playlistUrl: string, onQuality?: (quality: number) => void): Promise<string[]>;
}
export = M3U8Service;
//# sourceMappingURL=m3u8.service.d.ts.map
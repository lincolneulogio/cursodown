"use strict";
class M3U8Service {
    constructor(m3u8Url) {
        this._playlist = [];
        if (!M3U8Service.isValidUrl(m3u8Url)) {
            throw new Error("Invalid URL");
        }
        this._m3u8Url = m3u8Url;
    }
    static isValidUrl(url) {
        try {
            new URL(url);
            return true;
        }
        catch {
            return false;
        }
    }
    _isValidM3U8Content(content) {
        return content.startsWith("#EXTM3U");
    }
    _extractUrlsAndQualities(m3u8Content) {
        const lines = m3u8Content.split("\n");
        const urlsAndQualities = [];
        let currentResolution = null;
        let currentQuality = null;
        lines.forEach((line) => {
            if (line.startsWith("#EXT-X-STREAM-INF")) {
                const match = line.match(/RESOLUTION=(\d+x\d+)/);
                if (match) {
                    currentResolution = match[1];
                    currentQuality = parseInt(match[1].split("x")[1], 10);
                }
            }
            else if (line.startsWith("http") && currentResolution && currentQuality != null) {
                urlsAndQualities.push({
                    quality: currentQuality,
                    resolution: currentResolution,
                    url: line,
                });
                currentResolution = null;
                currentQuality = null;
            }
        });
        return urlsAndQualities;
    }
    static async getFile(url, isBinary = false, maxRetries = 3) {
        let retries = 0;
        while (retries < maxRetries) {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${isBinary ? "binary" : "text"} file: ${response.statusText}`);
                }
                return isBinary ? await response.arrayBuffer() : await response.text();
            }
            catch {
                retries++;
            }
        }
        throw new Error("Failed to load file after multiple attempts");
    }
    async loadPlaylist(maxRetries = 3) {
        const playlistContent = (await M3U8Service.getFile(this._m3u8Url, false, maxRetries));
        if (!this._isValidM3U8Content(playlistContent)) {
            throw new Error("Invalid M3U8 playlist content");
        }
        this._playlist = this._extractUrlsAndQualities(playlistContent);
        return this._playlist;
    }
    getPlaylist() {
        return this._playlist;
    }
    _sortPlaylistByQuality(ascending = true) {
        return [...this._playlist].sort((a, b) => {
            const heightA = parseInt(a.resolution.split("x")[1], 10);
            const heightB = parseInt(b.resolution.split("x")[1], 10);
            return ascending ? heightA - heightB : heightB - heightA;
        });
    }
    getHighestQuality() {
        if (this._playlist.length === 0)
            return null;
        return this._sortPlaylistByQuality(false)[0];
    }
    getLowestQuality() {
        if (this._playlist.length === 0)
            return null;
        return this._sortPlaylistByQuality(true)[0];
    }
    /**
     * Resolves a master or media playlist into a flat list of .ts segment URLs.
     */
    static async resolveSegmentUrls(playlistUrl, onQuality) {
        const playlist = (await M3U8Service.getFile(playlistUrl, false));
        if (!playlist)
            return [];
        const lines = playlist.trim().split("\n");
        const urlList = [];
        lines.forEach((line) => {
            if (line.toLowerCase().indexOf(".ts") > -1) {
                urlList.push(line.trim());
            }
        });
        if (urlList.length > 0) {
            return urlList;
        }
        if (playlist.indexOf("m3u8") < 0) {
            return [];
        }
        let maximumQuality = 0;
        let maximumQualityPlaylistUrl = null;
        let getUrl = false;
        for (const line of lines) {
            if (getUrl) {
                maximumQualityPlaylistUrl = line.trim();
                getUrl = false;
            }
            const upper = line.toUpperCase();
            if (upper.indexOf("EXT-X-STREAM-INF") > -1 && upper.indexOf("RESOLUTION") > -1) {
                try {
                    const readQuality = parseInt(line.split("RESOLUTION=")[1].split("X")[1].split(",")[0], 10) || 0;
                    if (readQuality > maximumQuality) {
                        maximumQuality = readQuality;
                        getUrl = true;
                    }
                }
                catch {
                    /* ignore malformed tags */
                }
            }
        }
        if (maximumQuality > 0 && maximumQualityPlaylistUrl) {
            onQuality?.(maximumQuality);
            return M3U8Service.resolveSegmentUrls(maximumQualityPlaylistUrl, onQuality);
        }
        return [];
    }
}
module.exports = M3U8Service;
//# sourceMappingURL=m3u8.service.js.map
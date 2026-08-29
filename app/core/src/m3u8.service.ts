import type { M3U8Variant } from "./types";

class M3U8Service {
	private _m3u8Url: string;
	private _playlist: M3U8Variant[] = [];

	constructor(m3u8Url: string) {
		if (!M3U8Service.isValidUrl(m3u8Url)) {
			throw new Error("Invalid URL");
		}
		this._m3u8Url = m3u8Url;
	}

	private static isValidUrl(url: string): boolean {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	}

	private static resolveUrl(baseUrl: string, maybeRelative: string): string {
		const raw = String(maybeRelative || "").trim();
		if (!raw) return "";
		try {
			return new URL(raw, baseUrl).href;
		} catch {
			return raw;
		}
	}

	private static fetchHeaders(): Record<string, string> {
		return {
			"User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			Referer: "https://www.udemy.com/",
			Origin: "https://www.udemy.com",
		};
	}

	private _isValidM3U8Content(content: string): boolean {
		return content.trimStart().startsWith("#EXTM3U");
	}

	private _extractUrlsAndQualities(m3u8Content: string, baseUrl: string): M3U8Variant[] {
		const lines = m3u8Content.split(/\r?\n/);
		const urlsAndQualities: M3U8Variant[] = [];

		let currentResolution: string | null = null;
		let currentQuality: number | null = null;
		let expectUri = false;

		for (const rawLine of lines) {
			const line = rawLine.trim();
			if (!line) continue;

			if (line.startsWith("#EXT-X-STREAM-INF")) {
				const match = line.match(/RESOLUTION=(\d+)x(\d+)/i);
				if (match) {
					currentResolution = `${match[1]}x${match[2]}`;
					currentQuality = parseInt(match[2], 10);
					expectUri = true;
				}
				continue;
			}

			if (line.startsWith("#")) continue;

			if (expectUri && currentResolution && currentQuality != null) {
				const absolute = M3U8Service.resolveUrl(baseUrl, line);
				if (absolute) {
					urlsAndQualities.push({
						quality: currentQuality,
						resolution: currentResolution,
						url: absolute,
					});
				}
				currentResolution = null;
				currentQuality = null;
				expectUri = false;
			}
		}

		return urlsAndQualities;
	}

	static async getFile(url: string, isBinary = false, maxRetries = 3): Promise<string | ArrayBuffer> {
		let retries = 0;
		let lastError: unknown;

		while (retries < maxRetries) {
			try {
				const response = await fetch(url, { headers: M3U8Service.fetchHeaders() });
				if (!response.ok) {
					throw new Error(
						`Failed to fetch ${isBinary ? "binary" : "text"} file: ${response.status} ${response.statusText}`
					);
				}
				return isBinary ? await response.arrayBuffer() : await response.text();
			} catch (error) {
				lastError = error;
				retries++;
			}
		}

		throw new Error(
			`Failed to load file after multiple attempts: ${
				lastError instanceof Error ? lastError.message : String(lastError)
			}`
		);
	}

	async loadPlaylist(maxRetries = 3): Promise<M3U8Variant[]> {
		const playlistContent = (await M3U8Service.getFile(this._m3u8Url, false, maxRetries)) as string;
		if (!this._isValidM3U8Content(playlistContent)) {
			throw new Error("Invalid M3U8 playlist content");
		}
		this._playlist = this._extractUrlsAndQualities(playlistContent, this._m3u8Url);
		return this._playlist;
	}

	getPlaylist(): M3U8Variant[] {
		return this._playlist;
	}

	private _sortPlaylistByQuality(ascending = true): M3U8Variant[] {
		return [...this._playlist].sort((a, b) => {
			const heightA = parseInt(a.resolution.split("x")[1], 10);
			const heightB = parseInt(b.resolution.split("x")[1], 10);
			return ascending ? heightA - heightB : heightB - heightA;
		});
	}

	getHighestQuality(): M3U8Variant | null {
		if (this._playlist.length === 0) return null;
		return this._sortPlaylistByQuality(false)[0];
	}

	getLowestQuality(): M3U8Variant | null {
		if (this._playlist.length === 0) return null;
		return this._sortPlaylistByQuality(true)[0];
	}

	private static isLikelySegmentUri(line: string): boolean {
		const lower = line.toLowerCase();
		if (lower.includes(".m3u8") || lower.startsWith("#")) return false;
		return (
			lower.includes(".ts") ||
			lower.includes(".m4s") ||
			lower.includes(".mp4") ||
			lower.includes(".aac") ||
			lower.startsWith("http") ||
			lower.includes("/")
		);
	}

	/**
	 * Resolves a master or media playlist into a flat list of segment URLs.
	 */
	static async resolveSegmentUrls(
		playlistUrl: string,
		onQuality?: (quality: number) => void
	): Promise<string[]> {
		const playlist = (await M3U8Service.getFile(playlistUrl, false)) as string;
		if (!playlist) return [];

		const upperPlaylist = playlist.toUpperCase();
		if (
			upperPlaylist.includes("EXT-X-KEY") ||
			upperPlaylist.includes("SAMPLE-AES") ||
			upperPlaylist.includes("WIDEVINE")
		) {
			throw new Error("HLS playlist is DRM-encrypted (EXT-X-KEY)");
		}

		const lines = playlist
			.trim()
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);

		const mediaSegments: string[] = [];
		let pendingMapUri: string | null = null;

		for (const line of lines) {
			if (line.startsWith("#EXT-X-MAP:")) {
				const match = line.match(/URI="([^"]+)"/i) || line.match(/URI=([^,]+)/i);
				if (match?.[1]) {
					pendingMapUri = M3U8Service.resolveUrl(playlistUrl, match[1].trim());
				}
				continue;
			}
			if (line.startsWith("#")) continue;
			if (line.toLowerCase().includes(".m3u8")) continue;
			if (M3U8Service.isLikelySegmentUri(line)) {
				if (pendingMapUri) {
					mediaSegments.push(pendingMapUri);
					pendingMapUri = null;
				}
				mediaSegments.push(M3U8Service.resolveUrl(playlistUrl, line));
			}
		}

		if (mediaSegments.length > 0) {
			return mediaSegments;
		}

		let maximumQuality = 0;
		let maximumQualityPlaylistUrl: string | null = null;
		let expectVariantUri = false;
		let pendingQuality = 0;

		for (const line of lines) {
			if (line.startsWith("#EXT-X-STREAM-INF")) {
				expectVariantUri = false;
				pendingQuality = 0;
				const upper = line.toUpperCase();
				if (upper.includes("RESOLUTION")) {
					try {
						const readQuality =
							parseInt(line.split(/RESOLUTION=/i)[1].split(/x/i)[1].split(",")[0], 10) || 0;
						pendingQuality = readQuality;
						expectVariantUri = true;
					} catch {
						/* ignore malformed tags */
					}
				}
				continue;
			}

			if (line.startsWith("#")) continue;

			if (expectVariantUri) {
				const absolute = M3U8Service.resolveUrl(playlistUrl, line);
				if (pendingQuality >= maximumQuality && absolute) {
					maximumQuality = pendingQuality;
					maximumQualityPlaylistUrl = absolute;
				}
				expectVariantUri = false;
				pendingQuality = 0;
			}
		}

		if (maximumQualityPlaylistUrl) {
			if (maximumQuality > 0) onQuality?.(maximumQuality);
			return M3U8Service.resolveSegmentUrls(maximumQualityPlaylistUrl, onQuality);
		}

		return [];
	}
}

export = M3U8Service;

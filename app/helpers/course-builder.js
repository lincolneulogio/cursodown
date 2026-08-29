"use strict";

/**
 * Builds downloadable courseData (with chapters/lectures) from Udemy curriculum results.
 * Shared by legacy app.js and the React preload bridge.
 */

const utils = require("./utils");
const { DownloadType } = require("./settings-store");

/**
 * @param {object} options
 * @param {string|number} options.courseId
 * @param {string} options.courseName
 * @param {string} [options.courseUrl]
 * @param {{ results?: unknown[] }|null} options.response
 * @param {object} options.settings - Settings store snapshot/API
 * @param {(title: string, ...details: string[]) => void} [options.onLog]
 * @returns {object|null}
 */
function buildCourseData({ courseId, courseName, courseUrl = "", response, settings, onLog, instructor = "" }) {
	if (!response || !Array.isArray(response.results) || response.results.length === 0) {
		return null;
	}

	const downloadType = Number(settings.download?.type);
	const downloadAttachments =
		downloadType === DownloadType.Both || downloadType === DownloadType.OnlyAttachments;
	const onlySubtitles = downloadType === DownloadType.OnlySubtitles;
	const videoQuality = settings.download?.videoQuality || "Highest";
	const skipSubtitles = Boolean(settings.download?.skipSubtitles) && !onlySubtitles;
	const baseUrl = String(courseUrl || "").replace(/\/?$/, "/");

	const courseData = {
		id: courseId,
		name: courseName,
		instructor: String(instructor || "").trim(),
		chapters: [],
		totalLectures: 0,
		encryptedVideos: 0,
		videoCount: 0,
		errorCount: 0,
		availableSubs: {},
	};

	let chapterData = null;

	const ensureChapter = () => {
		if (!chapterData) {
			chapterData = { id: 0, name: "Chapter 1", lectures: [] };
		}
	};

	const log = (title, ...details) => {
		if (typeof onLog === "function") {
			onLog(title, ...details);
		}
	};

	response.results.forEach((item) => {
		if (!item || typeof item !== "object") return;
		const type = String(item._class || "").toLowerCase();

		if (type === "chapter") {
			if (chapterData) {
				courseData.chapters.push(chapterData);
			}
			chapterData = {
				id: item.id,
				name: String(item.title || "").trim() || "Chapter",
				lectures: [],
			};
			return;
		}

		ensureChapter();

		if (type === "quiz" || type === "practice") {
			const srcUrl = `${baseUrl}t/${item._class}/${item.id}`;
			chapterData.lectures.push({
				type: "url",
				name: item.title,
				src: `<script type="text/javascript">window.location = "${srcUrl}";</script>`,
				quality: "Attachment",
			});
			courseData.totalLectures++;
			return;
		}

		const lecture = {
			type,
			name: item.title,
			src: "",
			quality: videoQuality,
			isEncrypted: false,
			duration: "",
			durationSeconds: 0,
		};

		const asset = item.asset;
		const supplementaryAssets = Array.isArray(item.supplementary_assets)
			? item.supplementary_assets
			: [];

		const rawLength = Number(asset?.length || item.asset?.time_estimation || 0);
		if (Number.isFinite(rawLength) && rawLength > 0) {
			lecture.durationSeconds = rawLength;
			lecture.duration = utils.formatDuration(rawLength);
		}

		if (!asset || typeof asset !== "object") {
			log("Missing asset", `Course: ${courseId}|${courseName}`, `Lecture: ${item.id}|${item.title}`);
			chapterData.lectures.push(lecture);
			courseData.totalLectures++;
			return;
		}

		const assetType = String(asset.asset_type || "").toLowerCase();

		if (assetType === "article") {
			lecture.type = "article";
			lecture.quality = asset.asset_type;
			lecture.src = asset.data?.body ?? asset.body;
		} else if (assetType === "file" || assetType === "e-book") {
			lecture.type = "file";
			lecture.quality = asset.asset_type;
			lecture.src = asset.download_urls?.[asset.asset_type]?.[0]?.file || "";
		} else if (assetType === "presentation") {
			lecture.type = "file";
			lecture.quality = asset.asset_type;
			lecture.src = asset.url_set?.[asset.asset_type]?.[0]?.file || "";
		} else if (assetType.startsWith("video")) {
			courseData.videoCount++;
			const streams = asset.streams;
			const encrypted =
				Boolean(streams?.isEncrypted) || utils.isUdemyVideoEncrypted(asset);

			if (encrypted) {
				lecture.type = "video";
				lecture.quality = "Encrypted";
				lecture.src = "";
				lecture.isEncrypted = true;
				courseData.encryptedVideos++;
			} else if (!streams?.minQuality) {
				lecture.type = "url";
				lecture.quality = "NotFound";
				lecture.src = `<script type="text/javascript">window.location = "${baseUrl}${item._class}/${item.id}";</script>`;
				log(
					"File not uploaded",
					`Course: ${courseId}|${courseName}`,
					`Lecture: ${item.id}|${item.title}`
				);
			} else {
				switch (String(lecture.quality || "").toLowerCase()) {
					case "":
					case "auto":
					case "highest":
						lecture.quality = streams.maxQuality;
						break;
					case "lowest":
						lecture.quality = streams.minQuality;
						break;
					default:
						lecture.quality = utils.isNumber(lecture.quality)
							? lecture.quality
							: String(lecture.quality).slice(0, -1);
				}

				if (lecture.quality && !streams.sources?.[lecture.quality]) {
					if (utils.isNumber(lecture.quality) && streams.maxQuality !== "auto") {
						const source = utils.getClosestValue(streams.sources, lecture.quality);
						lecture.quality = source?.key || streams.maxQuality;
					} else {
						lecture.quality = streams.maxQuality;
					}
				}

				if (String(lecture.quality).toLowerCase() === "auto" && streams.sources) {
					const numeric = Object.keys(streams.sources)
						.filter((key) => /^\d+$/.test(key))
						.map((key) => Number(key))
						.sort((a, b) => b - a);
					if (numeric.length > 0) {
						lecture.quality = String(numeric[0]);
					}
				}

				// Prefer progressive MP4 when available — HLS saved as .mp4 is often
				// MPEG-TS and plays with no video/audio in Windows players.
				const sources = streams.sources || {};
				let selected = sources[lecture.quality];
				const isHlsType = (type) =>
					String(type || "").toLowerCase().includes("mpegurl") ||
					String(type || "").toLowerCase().includes("m3u8");

				if (!selected?.url || isHlsType(selected.type) || utils.isEncryptedMediaUrl(selected.url)) {
					const mp4Entries = Object.entries(sources)
						.filter(
							([, src]) =>
								src?.url &&
								!utils.isEncryptedMediaUrl(src.url) &&
								String(src.type || "").toLowerCase() === "video/mp4"
						)
						.map(([key, src]) => ({
							key,
							src,
							numeric: /^\d+$/.test(key) ? Number(key) : -1,
						}))
						.sort((a, b) => b.numeric - a.numeric);

					if (mp4Entries.length > 0) {
						const target = utils.isNumber(lecture.quality) ? Number(lecture.quality) : null;
						let best = mp4Entries[0];
						if (target != null) {
							best = mp4Entries.reduce((closest, entry) => {
								if (entry.numeric < 0) return closest;
								if (closest.numeric < 0) return entry;
								return Math.abs(entry.numeric - target) < Math.abs(closest.numeric - target)
									? entry
									: closest;
							}, mp4Entries[0]);
						}
						selected = best.src;
						lecture.quality = best.key;
					}
				}

				if (selected?.url && !utils.isEncryptedMediaUrl(selected.url)) {
					lecture.src = selected.url;
					lecture.type = selected.type;
					if (/\.m3u8(\?|$)/i.test(lecture.src)) {
						lecture.type = "application/x-mpegurl";
					}
				} else {
					lecture.type = "video";
					lecture.quality = "Encrypted";
					lecture.src = "";
					lecture.isEncrypted = true;
					courseData.encryptedVideos++;
				}
			}
		} else {
			log("Unknown Asset Type ", `type: ${assetType}`, `Course: ${courseId}|${courseName}`);
		}

		const captions = Array.isArray(asset.captions) ? asset.captions : [];
		if (!skipSubtitles && captions.length > 0) {
			lecture.subtitles = {};
			captions.forEach((caption) => {
				const label = caption.video_label;
				if (!label) return;
				courseData.availableSubs[label] = (courseData.availableSubs[label] || 0) + 1;
				lecture.subtitles[label] = caption.url;
			});
		}

		if (downloadAttachments && supplementaryAssets.length > 0) {
			lecture.attachments = [];
			supplementaryAssets.forEach((attachment) => {
				const attType = attachment.download_urls ? "file" : "url";
				const src = attachment.download_urls
					? attachment.download_urls[attachment.asset_type]?.[0]?.file
					: `<script type="text/javascript">window.location = "${attachment.external_url}";</script>`;
				lecture.attachments.push({
					type: attType,
					name: attachment.title,
					src,
					quality: "Attachment",
				});
			});
		}

		chapterData.lectures.push(lecture);
		courseData.totalLectures++;
	});

	if (chapterData) {
		courseData.chapters.push(chapterData);
	}

	return courseData;
}

module.exports = { buildCourseData };

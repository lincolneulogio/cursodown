"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const { EventEmitter } = require("events");
const axios = require("./http-client");
const sanitize = require("sanitize-filename");
const vtt2srt = require("node-vtt-to-srt");
const Downloader = require("mt-files-downloader");
const Download = require("mt-files-downloader/lib/Download");
const M3U8Service = require("./m3u8.service");
const { finalizeDownloadedMedia, isValidMediaFile } = require("../../helpers/media-finalize");
const { resolveCoursePath } = require("../../helpers/path-template");
const BandwidthLimiter = require("../../helpers/bandwidth-limiter");
const { exportCourseIndex } = require("../../helpers/course-export");

// mt-files-downloader ignores custom headers and always forces port 80.
const _origSetOptions = Download.prototype.setOptions;
Download.prototype.setOptions = function patchedSetOptions(options) {
	_origSetOptions.call(this, options || {});
	if (options && options.headers) {
		this.options.headers = options.headers;
	}
	if (!options || options.port == null) {
		delete this.options.port;
	}
	return this;
};

const MEDIA_FETCH_HEADERS = Object.freeze({
	"User-Agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	Referer: "https://www.udemy.com/",
	Origin: "https://www.udemy.com",
});

const LABEL_COLOR_MAP = Object.freeze({
	144: "brown",
	240: "purple",
	360: "yellow",
	432: "orange",
	480: "teal",
	576: "blue",
	720: "olive",
	1080: "green",
	Highest: "green",
	auto: "red",
	Auto: "red",
	Attachment: "pink",
	Subtitle: "black",
});

/**
 * Pure download engine for one course.
 * Emits UI-agnostic events; the renderer binds DOM to these.
 *
 * Events:
 *  - progress:individual { percent }
 *  - progress:combined { action: "reset"|"increment", total? }
 *  - speed { value, unit }
 *  - quality { label, color }
 *  - pause-state { paused: boolean }
 *  - path { downloadPath }
 *  - drm { filePath, encryptedVideos }
 *  - log { title, detail }
 *  - complete { success: true }
 *  - encrypted-stop {}
 *  - error { error, retryable: boolean }
 *  - notify { pathCourse, courseName }
 */
class DownloadService extends EventEmitter {
	/**
	 * @param {object} deps
	 * @param {object} deps.settings - Settings module API
	 * @param {object} deps.utils - helpers/utils
	 * @param {(key: string) => string} deps.translate
	 * @param {number} [deps.httpTimeout]
	 * @param {(error: Error) => void} [deps.captureException]
	 */
	constructor(deps) {
		super();
		this.settings = deps.settings;
		this.utils = deps.utils;
		this.translate = deps.translate || ((t) => t);
		this.httpTimeout = deps.httpTimeout || 40000;
		this.captureException = deps.captureException || (() => {});
		/** @type {Map<string, CourseDownloadSession>} */
		this.#sessions = new Map();
	}

	/** @type {Map<string, CourseDownloadSession>} */
	#sessions;

	/**
	 * @param {string|number} courseId
	 * @param {object} courseData
	 * @param {string|string[]} subTitle
	 * @returns {CourseDownloadSession}
	 */
	start(courseId, courseData, subTitle = "") {
		const id = String(courseId);
		this.cancel(id);

		const session = new CourseDownloadSession({
			courseId: id,
			courseData,
			subTitle,
			settings: this.settings,
			utils: this.utils,
			translate: this.translate,
			httpTimeout: this.httpTimeout,
			captureException: this.captureException,
			emit: (event, payload) => {
				const active = this.#sessions.get(id);
				this.emit(event, {
					courseId: id,
					courseName: active?.courseName,
					...payload,
				});
			},
		});

		this.#sessions.set(id, session);
		session.start();
		return session;
	}

	pause(courseId) {
		const session = this.#sessions.get(String(courseId));
		if (session) session.pause();
	}

	resume(courseId) {
		const session = this.#sessions.get(String(courseId));
		if (session) session.resume();
	}

	cancel(courseId) {
		const id = String(courseId);
		const session = this.#sessions.get(id);
		if (session) {
			session.abort();
			this.#sessions.delete(id);
		}
	}

	complete(courseId) {
		this.#sessions.delete(String(courseId));
	}

	isActive(courseId) {
		return this.#sessions.has(String(courseId));
	}

	/**
	 * @param {string} filePath
	 * @param {boolean} [skipExisting]
	 * @returns {boolean}
	 */
	static shouldSkipExistingFile(filePath, skipExisting = true) {
		if (!filePath || !fs.existsSync(filePath)) {
			return false;
		}
		if (skipExisting === false) {
			try {
				fs.unlinkSync(filePath);
			} catch (_error) {}
			const mtdPath = `${filePath}.mtd`;
			if (fs.existsSync(mtdPath)) {
				try {
					fs.unlinkSync(mtdPath);
				} catch (_error) {}
			}
			return false;
		}
		return true;
	}

	static hasDRMProtection(dl) {
		try {
			const encrypted = Boolean(dl && dl.url && String(dl.url).includes("encrypted-files"));
			if (encrypted) console.warn("Arquivo encriptado", dl);
			return encrypted;
		} catch (_error) {
			return false;
		}
	}

	static get labelColorMap() {
		return LABEL_COLOR_MAP;
	}
}

class CourseDownloadSession {
	constructor(options) {
		this.courseId = options.courseId;
		this.courseData = options.courseData;
		this.settings = options.settings;
		this.utils = options.utils;
		this.translate = options.translate;
		this.httpTimeout = options.httpTimeout;
		this.captureException = options.captureException;
		this.emit = options.emit;

		const raw = Array.isArray(options.subTitle) ? options.subTitle[0] : options.subTitle;
		this.subtitle = String(raw || "").split("|").filter(Boolean);

		this.cancelled = false;
		this.timerDownloader = null;
		this.downloader = new Downloader();
		this.downloaded = 0;
		this.toDownload = 0;
		this.courseName = sanitize(this.courseData.name || "course");
		const downloadRoot = this.settings.downloadDirectory();
		const layout = this.settings.download.folderLayout === "instructor" ? "instructor" : "course";
		const resolved = resolveCoursePath({
			downloadRoot,
			courseName: this.courseData.name || this.courseName,
			instructor: this.courseData.instructor || this.courseData.instructorName || "",
			layout,
		});
		this.downloadDirectory = downloadRoot;
		this.coursePath = resolved.coursePath;
		this.bandwidth = new BandwidthLimiter(Number(this.settings.download.bandwidthLimitKbps) || 0);
	}

	start() {
		this.emit("path", { downloadPath: this.coursePath });

		const lectureChapterMap = {};
		let sequenceMap = 0;
		this.courseData.chapters.forEach((chapter, chapterIndex) => {
			chapter.lectures.forEach((_lecture, lectureIndex) => {
				sequenceMap++;
				lectureChapterMap[sequenceMap] = { chapterIndex, lectureIndex };
			});
		});

		this.toDownload = this.courseData.totalLectures;
		const enableDownloadStartEnd = this.settings.download.enableDownloadStartEnd;
		let downloadStart = 1;

		if (enableDownloadStartEnd) {
			downloadStart = Math.max(1, Math.min(this.settings.download.downloadStart, this.toDownload));
			let downloadEnd = Math.max(0, this.settings.download.downloadEnd);
			downloadEnd = Math.max(downloadStart, downloadEnd === 0 ? this.toDownload : downloadEnd);
			this.toDownload = downloadEnd - downloadStart + 1;
		}

		this.emit("progress:combined", { action: "reset", total: this.toDownload });
		this.emit("pause-state", { paused: false });

		if (enableDownloadStartEnd) {
			const mapped = lectureChapterMap[downloadStart];
			this.downloadChapter(mapped.chapterIndex, mapped.lectureIndex);
		} else {
			this.downloadChapter(0, 0);
		}
	}

	abort() {
		this.cancelled = true;
		if (this.timerDownloader) {
			clearInterval(this.timerDownloader);
			this.timerDownloader = null;
		}
		try {
			(this.downloader._downloads || []).forEach((dl) => {
				if (dl && typeof dl.stop === "function") dl.stop();
			});
		} catch (_error) {}
	}

	pause(isEncrypted) {
		if (this.downloader._downloads?.length) {
			this.downloader._downloads[this.downloader._downloads.length - 1].stop();
			this.emit("pause-state", { paused: true });
			if (isEncrypted) {
				this.emit("encrypted-stop", {});
			}
		}
	}

	resume() {
		if (this.downloader._downloads?.length) {
			this.downloader._downloads[this.downloader._downloads.length - 1].resume();
			this.emit("pause-state", { paused: false });
		}
	}

	setLabelQuality(label) {
		const color = LABEL_COLOR_MAP[label] || "grey";
		this.emit("quality", { label, color });
	}

	shouldSkip(filePath) {
		const skip = DownloadService.shouldSkipExistingFile(
			filePath,
			this.settings.download.skipExistingFiles !== false
		);
		if (!skip) return false;

		// Re-download broken "videos" that are empty HTML/playlists misnamed as .mp4
		if (/\.(mp4|ts)$/i.test(filePath) && !isValidMediaFile(filePath)) {
			try {
				fs.unlinkSync(filePath);
			} catch (_error) {}
			const mtdPath = `${filePath}.mtd`;
			if (fs.existsSync(mtdPath)) {
				try {
					fs.unlinkSync(mtdPath);
				} catch (_error) {}
			}
			return false;
		}
		return true;
	}

	downloadChapter(chapterIndex, lectureIndex) {
		if (this.cancelled) return;
		try {
			const countLectures = this.courseData.chapters[chapterIndex].lectures.length;
			const seqName = this.utils.getSequenceName(
				chapterIndex + 1,
				this.courseData.chapters.length,
				sanitize(this.courseData.chapters[chapterIndex].name.trim()),
				". ",
				this.coursePath
			);

			fs.mkdirSync(seqName.fullPath, { recursive: true });
			this.downloadLecture(chapterIndex, lectureIndex, countLectures, seqName.name);
		} catch (error) {
			this.emit("log", { title: "EDOWNLOADING_CHAPTER", detail: error });
			this.emit("error", { error, retryable: false });
		}
	}

	downloadLecture(chapterIndex, lectureIndex, countLectures, sanitizedChapterName) {
		if (this.cancelled) return;
		try {
			if (this.downloaded === this.toDownload) {
				try {
					if (this.settings.download.exportIndexOnComplete !== false) {
						exportCourseIndex(this.courseData, this.coursePath);
					}
				} catch (error) {
					this.emit("log", { title: "Export index failed", detail: error });
				}
				this.emit("complete", {
					success: true,
					pathCourse: this.coursePath,
					courseName: this.courseName,
					encryptedVideos: Number(this.courseData.encryptedVideos) || 0,
				});
				this.emit("notify", {
					pathCourse: this.coursePath,
					courseName: this.courseName,
				});
				return;
			}
			if (lectureIndex === countLectures) {
				this.downloadChapter(chapterIndex + 1, 0);
				return;
			}

			const chapterName = this.courseData.chapters[chapterIndex].name.trim();
			const lectureData = this.courseData.chapters[chapterIndex].lectures[lectureIndex];
			const lectureType = String(lectureData.type || "").toLowerCase();
			const lectureName = lectureData.name.trim();
			const sanitizedLectureName = sanitize(lectureName);
			const chapterDir = path.join(this.coursePath, sanitizedChapterName);

			const dlStart = (dl, typeVideo, callback) => {
				if (this.cancelled) return;
				dl.setRetryOptions({ maxRetries: 3, retryInterval: 2000 });
				dl.setOptions({
					threadsCount: this.bandwidth.suggestedThreads(),
					timeout: 8000,
					range: "0-100",
					headers: MEDIA_FETCH_HEADERS,
				});
				dl.start();

				let notStarted = 0;
				let reStarted = 0;
				let endHandled = false;
				let lastCompletedBytes = 0;

				this.timerDownloader = setInterval(() => {
					if (this.cancelled) {
						clearInterval(this.timerDownloader);
						this.timerDownloader = null;
						try {
							if (dl && typeof dl.stop === "function") dl.stop();
						} catch (_error) {}
						return;
					}

					switch (dl.status) {
						case 0:
							if (reStarted <= 5) {
								notStarted++;
								if (notStarted >= 15) {
									dl.start();
									notStarted = 0;
									reStarted++;
								}
							}
							this.emit("speed", { value: 0, unit: "B/s" });
							break;
						case 1:
						case -1: {
							const stats = dl.getStats();
							const speedAndUnit = this.utils.getDownloadSpeed(stats.present.speed || 0);
							this.emit("speed", speedAndUnit);
							this.emit("progress:individual", { percent: stats.total.completed });

							const downloadedBytes = Number(stats.total.downloaded) || 0;
							const instantSpeed = Number(stats.present.speed) || 0;
							if (
								this.bandwidth.enabled &&
								dl.status === 1 &&
								instantSpeed > this.bandwidth.bytesPerSec * 1.15
							) {
								try {
									dl.stop();
								} catch (_error) {}
								const overshoot = Math.max(instantSpeed - this.bandwidth.bytesPerSec, 32 * 1024);
								void this.bandwidth.wait(overshoot).then(() => {
									if (!this.cancelled && dl.status !== 2 && typeof dl.resume === "function") {
										try {
											dl.resume();
										} catch (_error) {}
									}
								});
							}
							lastCompletedBytes = downloadedBytes;

							if (dl.status === -1) {
								// Never treat zero-size / failed downloads as completed.
								this.emit("log", {
									title: "Download error",
									detail: { url: dl.url, error: dl.error || "unknown" },
								});
								try {
									if (fs.existsSync(dl.filePath) && fs.statSync(dl.filePath).size === 0) {
										fs.unlinkSync(dl.filePath);
									}
								} catch (_error) {}
								this.emit("error", {
									error: new Error(dl.error || "download failed"),
									retryable: Boolean(this.settings.download.autoRetry),
								});
								clearInterval(this.timerDownloader);
							}
							break;
						}
						case 2:
						case -3:
							break;
						default:
							this.emit("speed", { value: 0, unit: "B/s" });
					}
				}, 1000);

				dl.on("error", (item) => {
					console.error("dl.on(error)", item.error && item.error.message);
					if (DownloadService.hasDRMProtection(item)) {
						item.emit("end");
					} else {
						this.emit("log", { title: "DL_ONERROR", detail: item.error && item.error.message });
					}
				});

				dl.on("start", () => {
					this.emit("pause-state", { paused: false });
				});

				dl.on("stop", () => {
					console.warn("dl.on(stop)");
				});

				dl.on("end", () => {
					if (endHandled) return;
					endHandled = true;
					clearInterval(this.timerDownloader);

					const finish = () => callback();

					if (typeVideo && DownloadService.hasDRMProtection(dl)) {
						this.courseData.encryptedVideos = Number(this.courseData.encryptedVideos || 0) + 1;
						this.emit("drm", {
							filePath: dl.filePath,
							encryptedVideos: this.courseData.encryptedVideos,
						});
						this.emit("log", { title: `DRM Protected::${this.courseData.name}`, detail: dl.filePath });
						fs.unlink(dl.filePath + ".mtd", (err) => {
							if (err) console.error("dl.on(end)__fs.unlink", err.message);
						});

						if (!this.settings.download.continueDonwloadingEncrypted) {
							dl.destroy();
							this.pause(true);
							return;
						}
						finish();
						return;
					}

					if (typeVideo) {
						finalizeDownloadedMedia(dl.filePath)
							.then((result) => {
								if (result.remuxed) {
									this.emit("log", {
										title: "Video remuxed to playable MP4",
										detail: result.path,
									});
								} else if (result.renamed) {
									this.emit("log", {
										title: "Video saved as .ts (open with VLC)",
										detail: result.path,
									});
								}
								if (!isValidMediaFile(result.path)) {
									throw new Error("Downloaded file is not a valid media container");
								}
								finish();
							})
							.catch((error) => {
								this.emit("log", { title: "Invalid downloaded video", detail: error.message });
								this.emit("error", { error, retryable: false });
							});
						return;
					}

					finish();
				});
			};

			const downloadAttachments = (index, totalAttachments) => {
				this.emit("progress:individual", { percent: 0 });
				const attachment = lectureData.attachments[index];
				const attachmentName = attachment.name.trim();
				this.setLabelQuality(attachment.quality || "Attachment");

				if (["article", "url"].includes(attachment.type)) {
					fs.writeFile(
						this.utils.getSequenceName(lectureIndex + 1, countLectures, attachmentName + ".html", `.${index + 1} `, chapterDir).fullPath,
						attachment.src,
						() => {
							index++;
							if (index === totalAttachments) {
								this.emit("progress:combined", { action: "increment" });
								this.downloaded++;
								this.downloadLecture(chapterIndex, lectureIndex + 1, countLectures, sanitizedChapterName);
							} else {
								downloadAttachments(index, totalAttachments);
							}
						}
					);
					return;
				}

				let fileExtension = attachment.src.split("/").pop().split("?").shift().split(".").pop();
				fileExtension = attachment.name.split(".").pop() == fileExtension ? "" : "." + fileExtension;

				const lectureSeqName = this.utils.getSequenceName(
					lectureIndex + 1,
					countLectures,
					sanitize(attachmentName) + fileExtension,
					`.${index + 1} `,
					chapterDir
				);

				if (fs.existsSync(lectureSeqName.fullPath + ".mtd") && !fs.statSync(lectureSeqName.fullPath + ".mtd").size) {
					fs.unlinkSync(lectureSeqName.fullPath + ".mtd");
				}

				const endAttachment = () => {
					index++;
					clearInterval(this.timerDownloader);
					if (index === totalAttachments) {
						this.emit("progress:combined", { action: "increment" });
						this.downloaded++;
						this.downloadLecture(chapterIndex, lectureIndex + 1, countLectures, sanitizedChapterName);
					} else {
						downloadAttachments(index, totalAttachments);
					}
				};

				let dl;
				if (fs.existsSync(lectureSeqName.fullPath + ".mtd")) {
					dl = this.downloader.resumeDownload(lectureSeqName.fullPath);
				} else if (this.shouldSkip(lectureSeqName.fullPath)) {
					endAttachment();
					return;
				} else {
					dl = this.downloader.download(attachment.src, lectureSeqName.fullPath);
				}

				dlStart(dl, String(attachment.type || "").includes("video"), endAttachment);
			};

			const downloadType = Number(this.settings.download.type);
			const DownloadType = this.settings.DownloadType;
			const onlyAttachments = downloadType === DownloadType.OnlyAttachments;
			const onlySubtitles = downloadType === DownloadType.OnlySubtitles;
			const onlyLectures = downloadType === DownloadType.OnlyLectures;
			const skipAttachments = onlyLectures || onlySubtitles;

			const checkAttachment = () => {
				this.emit("progress:individual", { percent: 0 });
				if (!skipAttachments && lectureData.attachments) {
					lectureData.attachments.sort(this.utils.dynamicSort("name"));
					downloadAttachments(0, lectureData.attachments.length);
				} else {
					if (lectureData.isEncrypted) {
						this.emit("log", {
							title: "Video with DRM Protection",
							detail: `Chapter: ${chapterName}\nLecture: ${lectureName}`,
						});
					}
					this.emit("progress:combined", { action: "increment" });
					this.downloaded++;
					this.downloadLecture(chapterIndex, lectureIndex + 1, countLectures, sanitizedChapterName);
				}
			};

			const downloadSubtitle = () => {
				this.emit("progress:individual", { percent: 0 });
				this.setLabelQuality("Subtitle");
				this.emit("speed", { value: 0, unit: "B/s" });

				const subtitleSeqName = this.utils.getSequenceName(
					lectureIndex + 1,
					countLectures,
					sanitizedLectureName + ".srt",
					". ",
					path.join(chapterDir, "subs")
				);

				if (fs.existsSync(subtitleSeqName.fullPath) && this.shouldSkip(subtitleSeqName.fullPath)) {
					checkAttachment();
					return;
				}

				fs.mkdirSync(path.join(chapterDir, "subs"), { recursive: true });

				const vttFile = subtitleSeqName.fullPath.replace(".srt", ".vtt");
				const vttFileWS = fs.createWriteStream(vttFile).on("finish", () => {
					const strFileWS = fs.createWriteStream(subtitleSeqName.fullPath).on("finish", () => {
						try {
							fs.unlinkSync(vttFile);
						} catch (_error) {}
						checkAttachment();
					});
					fs.createReadStream(vttFile).pipe(vtt2srt()).pipe(strFileWS);
				});

				const subtitles = lectureData.subtitles || {};
				const availables = this.subtitle.filter((el) => el in subtitles);
				let downloadThisSub = availables[0] || Object.keys(subtitles)[0] || "";

				if (availables.length > 1) {
					for (const key of availables) {
						const autoTag = `[${this.translate("Auto")}]`;
						if (key.indexOf("[Auto]") === -1 && key.indexOf(autoTag) === -1) {
							downloadThisSub = key;
							break;
						}
					}
				}

				if (!downloadThisSub || !subtitles[downloadThisSub]) {
					checkAttachment();
					return;
				}

				https.get(subtitles[downloadThisSub], (response) => {
					response.pipe(vttFileWS);
				});
			};

			const endDownloadAttachment = () => {
				clearInterval(this.timerDownloader);
				const hasSubs = Boolean(
					this.courseData.chapters[chapterIndex].lectures[lectureIndex].subtitles
				);
				if (hasSubs && (!this.settings.download.skipSubtitles || onlySubtitles)) {
					downloadSubtitle();
				} else {
					checkAttachment();
				}
			};

			this.emit("progress:individual", { percent: 0 });
			this.setLabelQuality(lectureData.quality || "Auto");

			if (onlySubtitles) {
				endDownloadAttachment();
				return;
			}

			if (lectureType === "article" || lectureType === "url") {
				if (onlyAttachments) {
					// keep articles/html when attachments-only (treated as non-video content)
				}
				const articlePath = this.utils.getSequenceName(
					lectureIndex + 1,
					countLectures,
					sanitizedLectureName + ".html",
					". ",
					chapterDir
				).fullPath;

				if (this.shouldSkip(articlePath)) {
					if (!skipAttachments && lectureData.attachments) {
						lectureData.attachments.sort(this.utils.dynamicSort("name"));
						downloadAttachments(0, lectureData.attachments.length);
					} else {
						this.emit("progress:combined", { action: "increment" });
						this.downloaded++;
						this.downloadLecture(chapterIndex, lectureIndex + 1, countLectures, sanitizedChapterName);
					}
					return;
				}

				fs.writeFile(articlePath, lectureData.src, () => {
					if (!skipAttachments && lectureData.attachments) {
						lectureData.attachments.sort(this.utils.dynamicSort("name"));
						downloadAttachments(0, lectureData.attachments.length);
					} else {
						this.emit("progress:combined", { action: "increment" });
						this.downloaded++;
						this.downloadLecture(chapterIndex, lectureIndex + 1, countLectures, sanitizedChapterName);
					}
				});
				return;
			}

			const seqName = this.utils.getSequenceName(
				lectureIndex + 1,
				countLectures,
				sanitizedLectureName + (lectureType === "file" ? ".pdf" : ".mp4"),
				". ",
				chapterDir
			);

			const isHlsLecture =
				lectureType === "application/x-mpegurl" ||
				/\.m3u8(\?|$)/i.test(String(lectureData.src || ""));
			const isVideoLike =
				lectureType.includes("video") ||
				isHlsLecture ||
				(lectureType !== "file" && lectureType !== "article" && lectureType !== "url");
			const skipMainMedia = onlySubtitles || (onlyAttachments && isVideoLike);

			if (!isHlsLecture) {
				if (lectureData.isEncrypted || this.utils.isEncryptedMediaUrl(lectureData.src)) {
					this.emit("log", {
						title: "Video with DRM Protection",
						detail: `Chapter: ${chapterName}\nLecture: ${lectureName}`,
					});
					endDownloadAttachment();
					return;
				}

				if (!lectureData.src) {
					this.emit("log", {
						title: "Missing video URL",
						detail: `Chapter: ${chapterName}\nLecture: ${lectureName}`,
					});
					endDownloadAttachment();
					return;
				}

				if (
					skipMainMedia ||
					this.shouldSkip(seqName.fullPath) ||
					this.shouldSkip(seqName.fullPath.replace(/\.mp4$/i, ".ts"))
				) {
					endDownloadAttachment();
					return;
				}

				if (fs.existsSync(seqName.fullPath + ".mtd") && !fs.statSync(seqName.fullPath + ".mtd").size) {
					fs.unlinkSync(seqName.fullPath + ".mtd");
				}

				let dl;
				if (fs.existsSync(seqName.fullPath + ".mtd")) {
					dl = this.downloader.resumeDownload(seqName.fullPath);
				} else {
					dl = this.downloader.download(lectureData.src, seqName.fullPath);
				}
				dlStart(dl, lectureType.includes("video") || lectureType === "video", endDownloadAttachment);
				return;
			}

			if (
				skipMainMedia ||
				lectureData.isEncrypted ||
				this.utils.isEncryptedMediaUrl(lectureData.src) ||
				this.shouldSkip(seqName.fullPath) ||
				this.shouldSkip(seqName.fullPath.replace(/\.mp4$/i, ".ts"))
			) {
				if (lectureData.isEncrypted || this.utils.isEncryptedMediaUrl(lectureData.src)) {
					this.emit("log", {
						title: "Video with DRM Protection",
						detail: `Chapter: ${chapterName}\nLecture: ${lectureName}`,
					});
				}
				endDownloadAttachment();
				return;
			}
			if (fs.existsSync(seqName.fullPath + ".mtd")) {
				fs.unlinkSync(seqName.fullPath + ".mtd");
			}

			this.downloadHls(lectureData.src, seqName.fullPath)
				.then(() => endDownloadAttachment())
				.catch((error) => {
					this.emit("log", { title: "downloadLecture_HLS_Error", detail: error });
					this.captureException(error);
					this.emit("error", { error, retryable: false });
				});
		} catch (error) {
			this.emit("log", { title: "downloadLecture_Error:", detail: error });
			this.captureException(error);
			this.emit("error", { error, retryable: false });
		}
	}

	/**
	 * Downloads an HLS playlist into a single binary file.
	 * @param {string} playlistUrl
	 * @param {string} outputPath
	 */
	async downloadHls(playlistUrl, outputPath) {
		if (!playlistUrl) {
			throw new Error("Missing HLS playlist URL");
		}
		if (this.utils.isEncryptedMediaUrl(playlistUrl)) {
			throw new Error("HLS URL is DRM-protected");
		}

		const list = await M3U8Service.resolveSegmentUrls(playlistUrl, (quality) => {
			this.setLabelQuality(quality);
		});

		if (!list.length) {
			throw new Error("No HLS segments found for this lecture (empty playlist)");
		}

		if (list.some((url) => this.utils.isEncryptedMediaUrl(url))) {
			throw new Error("HLS segments are DRM-protected");
		}

		this.emit("progress:individual", { percent: 0 });
		const PARALLEL = this.bandwidth.suggestedParallel();
		let count = 0;
		let bytesWindow = 0;
		let timeWindow = 0;

		if (fs.existsSync(outputPath)) {
			fs.unlinkSync(outputPath);
		}

		for (let i = 0; i < list.length; i += PARALLEL) {
			if (this.cancelled) return;
			const chunk = list.slice(i, i + PARALLEL);
			const startTime = performance.now();

			const buffers = await Promise.all(
				chunk.map(async (url) => {
					const response = await M3U8Service.getFile(url, true);
					if (!response) {
						throw new Error("Invalid or null HLS segment response");
					}
					return Buffer.from(response);
				})
			);

			const endTime = performance.now();
			const timeDiff = Math.max((endTime - startTime) / 1000.0, 0.001);
			const byteLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
			bytesWindow += byteLength;
			timeWindow += timeDiff;

			await this.bandwidth.wait(byteLength);

			const speedAndUnit = this.utils.getDownloadSpeed(bytesWindow / Math.max(timeWindow, 0.001));
			this.emit("speed", speedAndUnit);

			fs.appendFileSync(outputPath, Buffer.concat(buffers));
			count += chunk.length;
			this.emit("progress:individual", { percent: parseInt((count / list.length) * 100, 10) });

			if (count % (PARALLEL * 4) === 0) {
				bytesWindow = 0;
				timeWindow = 0;
			}
		}

		if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
			throw new Error("HLS download finished with an empty video file");
		}

		const result = await finalizeDownloadedMedia(outputPath);
		if (result.remuxed) {
			this.emit("log", { title: "HLS remuxed to playable MP4", detail: result.path });
		} else if (result.renamed) {
			this.emit("log", { title: "HLS saved as .ts (open with VLC)", detail: result.path });
		}

		if (!isValidMediaFile(result.path)) {
			throw new Error("HLS download finished but the file is not a valid media container");
		}
	}
}

module.exports = DownloadService;
module.exports.CourseDownloadSession = CourseDownloadSession;

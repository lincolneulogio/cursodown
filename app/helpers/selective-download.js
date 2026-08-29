"use strict";

/**
 * Resolves which lectures are missing or broken on disk for selective download.
 */

const fs = require("fs");
const path = require("path");
const sanitize = require("sanitize-filename");
const { isValidMediaFile } = require("./media-finalize");

/**
 * @param {object} utils - helpers/utils with getSequenceName
 * @param {object} courseData
 * @param {string} coursePath
 * @returns {{ missingKeys: string[], videoKeys: string[], presentKeys: string[], brokenPaths: string[] }}
 */
function analyzeCourseOnDisk(utils, courseData, coursePath) {
	const missingKeys = [];
	const videoKeys = [];
	const presentKeys = [];
	const brokenPaths = [];

	if (!courseData || !Array.isArray(courseData.chapters)) {
		return { missingKeys, videoKeys, presentKeys, brokenPaths };
	}

	const root = coursePath ? path.resolve(coursePath) : "";

	courseData.chapters.forEach((chapter, chapterIndex) => {
		const lectures = chapter.lectures || [];
		const chapterSeq = utils.getSequenceName(
			chapterIndex + 1,
			courseData.chapters.length,
			sanitize(String(chapter.name || `Chapter ${chapterIndex + 1}`).trim()),
			". ",
			root || null
		);
		const chapterDir = root ? chapterSeq.fullPath : "";

		lectures.forEach((lecture, lectureIndex) => {
			const key = `${chapterIndex}:${lectureIndex}`;
			const quality = String(lecture.quality || "").toLowerCase();
			const lectureType = String(lecture.type || "").toLowerCase();
			const isNonVideo =
				quality === "article" ||
				quality === "attachment" ||
				lectureType === "article" ||
				lectureType === "file" ||
				(lectureType === "url" && !lecture.isEncrypted);

			if (isNonVideo) {
				if (!lecture.isEncrypted) {
					// Articles/attachments: treat as missing if html/pdf absent when path known
					if (!root) {
						missingKeys.push(key);
						return;
					}
					const sanitizedLectureName = sanitize(String(lecture.name || "").trim());
					const ext = lectureType === "file" ? ".pdf" : ".html";
					const expected = utils.getSequenceName(
						lectureIndex + 1,
						lectures.length,
						sanitizedLectureName + ext,
						". ",
						chapterDir
					).fullPath;
					if (!fs.existsSync(expected)) missingKeys.push(key);
					else presentKeys.push(key);
				}
				return;
			}

			videoKeys.push(key);
			if (lecture.isEncrypted) {
				return;
			}

			if (!root || !fs.existsSync(root)) {
				missingKeys.push(key);
				return;
			}

			const sanitizedLectureName = sanitize(String(lecture.name || "").trim());
			const mp4Path = utils.getSequenceName(
				lectureIndex + 1,
				lectures.length,
				sanitizedLectureName + ".mp4",
				". ",
				chapterDir
			).fullPath;
			const tsPath = mp4Path.replace(/\.mp4$/i, ".ts");

			const candidates = [mp4Path, tsPath].filter((p) => fs.existsSync(p));
			if (candidates.length === 0) {
				missingKeys.push(key);
				return;
			}

			const valid = candidates.some((file) => {
				try {
					return fs.statSync(file).size > 0 && isValidMediaFile(file);
				} catch {
					return false;
				}
			});

			if (!valid) {
				missingKeys.push(key);
				candidates.forEach((file) => brokenPaths.push(file));
			} else {
				presentKeys.push(key);
			}
		});
	});

	return { missingKeys, videoKeys, presentKeys, brokenPaths };
}

/**
 * @param {object} utils
 * @param {object} courseData
 * @param {string} coursePath
 * @param {"all"|"videos"|"missing"|"new"} mode
 * @returns {string[]} selected lecture keys
 */
function selectKeysByMode(utils, courseData, coursePath, mode) {
	const analysis = analyzeCourseOnDisk(utils, courseData, coursePath);
	const chapters = courseData?.chapters || [];

	const allDownloadable = [];
	chapters.forEach((chapter, ci) => {
		(chapter.lectures || []).forEach((lecture, li) => {
			if (!lecture.isEncrypted) allDownloadable.push(`${ci}:${li}`);
		});
	});

	switch (mode) {
		case "videos":
			return analysis.videoKeys.filter((key) => allDownloadable.includes(key));
		case "missing":
		case "new":
			return analysis.missingKeys.filter((key) => allDownloadable.includes(key));
		case "all":
		default:
			return allDownloadable;
	}
}

module.exports = {
	analyzeCourseOnDisk,
	selectKeysByMode,
};

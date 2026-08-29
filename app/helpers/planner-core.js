"use strict";

/**
 * Pure course planner helpers (no jQuery) for preload / React bridge.
 */

function stats(courseData) {
	let total = 0;
	let encrypted = 0;
	(courseData?.chapters || []).forEach((chapter) => {
		(chapter.lectures || []).forEach((lecture) => {
			total += 1;
			if (lecture.isEncrypted) encrypted += 1;
		});
	});
	const percent = total === 0 ? 0 : Math.round((encrypted / total) * 100);
	return { total, encrypted, downloadable: total - encrypted, percent };
}

function filterCourse(courseData, selectedKeys) {
	const selected = selectedKeys instanceof Set ? selectedKeys : new Set(selectedKeys || []);
	const chapters = [];
	let totalLectures = 0;
	let encryptedVideos = 0;

	(courseData?.chapters || []).forEach((chapter, chapterIndex) => {
		const lectures = (chapter.lectures || []).filter((_lecture, lectureIndex) =>
			selected.has(`${chapterIndex}:${lectureIndex}`)
		);
		if (!lectures.length) return;
		chapters.push({ ...chapter, lectures });
		totalLectures += lectures.length;
		encryptedVideos += lectures.filter((lecture) => lecture.isEncrypted).length;
	});

	return {
		...courseData,
		chapters,
		totalLectures,
		encryptedVideos,
	};
}

module.exports = { stats, filterCourse };

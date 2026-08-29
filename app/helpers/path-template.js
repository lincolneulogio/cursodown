"use strict";

/**
 * Resolves where a course should be saved on disk.
 */

const path = require("path");
const sanitize = require("sanitize-filename");

/** @typedef {"course" | "instructor"} FolderLayout */

/**
 * @param {string} value
 * @param {string} [fallback]
 * @returns {string}
 */
function safeSegment(value, fallback = "Course") {
	const cleaned = sanitize(String(value || "").trim());
	return cleaned || fallback;
}

/**
 * @param {object} options
 * @param {string} options.downloadRoot - Settings download.path
 * @param {string} options.courseName
 * @param {string} [options.instructor]
 * @param {FolderLayout} [options.layout]
 * @returns {{ coursePath: string, relativeSegments: string[] }}
 */
function resolveCoursePath(options) {
	const root = options.downloadRoot || "";
	const course = safeSegment(options.courseName, "Course");
	const layout = options.layout === "instructor" ? "instructor" : "course";
	const segments = [];

	if (layout === "instructor") {
		segments.push(safeSegment(options.instructor, "Unknown instructor"));
	}
	segments.push(course);

	return {
		coursePath: path.join(root, ...segments),
		relativeSegments: segments,
		layout,
	};
}

module.exports = {
	resolveCoursePath,
	safeSegment,
};

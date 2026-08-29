"use strict";

/**
 * Detects and finalizes downloaded media so players get a real MP4 (not raw MPEG-TS).
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

/**
 * @param {string} filePath
 * @param {number} [length]
 * @returns {Buffer}
 */
function readHeader(filePath, length = 64) {
	const fd = fs.openSync(filePath, "r");
	try {
		const buf = Buffer.alloc(length);
		const bytesRead = fs.readSync(fd, buf, 0, length, 0);
		return buf.subarray(0, bytesRead);
	} finally {
		fs.closeSync(fd);
	}
}

/**
 * @param {Buffer} buf
 * @returns {"mpegts"|"mp4"|"fmp4"|"m3u8"|"html"|"unknown"}
 */
function detectContainerFromBuffer(buf) {
	if (!buf || buf.length === 0) return "unknown";

	if (buf[0] === 0x47) return "mpegts";

	const head = buf.toString("utf8", 0, Math.min(buf.length, 64)).trimStart().toLowerCase();
	if (head.startsWith("#extm3u")) return "m3u8";
	if (head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<?xml")) {
		return "html";
	}

	if (buf.includes(Buffer.from("ftyp"))) return "mp4";
	if (buf.includes(Buffer.from("moof")) || buf.includes(Buffer.from("mdat"))) return "fmp4";

	// MPEG-TS may not start exactly at 0 if a small preamble exists — scan sync bytes.
	for (let i = 0; i < Math.min(buf.length - 188, 188 * 3); i++) {
		if (buf[i] === 0x47 && buf[i + 188] === 0x47) return "mpegts";
	}

	return "unknown";
}

/**
 * @param {string} filePath
 * @returns {"mpegts"|"mp4"|"fmp4"|"m3u8"|"html"|"unknown"}
 */
function detectContainer(filePath) {
	if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
		return "unknown";
	}
	return detectContainerFromBuffer(readHeader(filePath, 512));
}

/**
 * @returns {string|null}
 */
function resolveFfmpegPath() {
	try {
		const ffmpegStatic = require("ffmpeg-static");
		if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
			return ffmpegStatic;
		}
	} catch (_error) {
		/* optional dependency */
	}
	return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

/**
 * @param {string} ffmpegPath
 * @param {string[]} args
 * @returns {Promise<void>}
 */
function runFfmpeg(ffmpegPath, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(ffmpegPath, args, {
			windowsHide: true,
			stdio: ["ignore", "ignore", "pipe"],
		});

		let stderr = "";
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
			if (stderr.length > 8000) stderr = stderr.slice(-4000);
		});

		child.on("error", (error) => reject(error));
		child.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
		});
	});
}

/**
 * Remuxes input into a progressive MP4 with faststart.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {"mpegts"|"mp4"|"fmp4"|"unknown"} container
 * @returns {Promise<boolean>} true if remux succeeded
 */
async function remuxToMp4(inputPath, outputPath, container) {
	const ffmpegPath = resolveFfmpegPath();
	const tempOut = `${outputPath}.remux.tmp.mp4`;

	try {
		if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);

		const args =
			container === "mpegts"
				? [
						"-hide_banner",
						"-y",
						"-fflags",
						"+genpts",
						"-i",
						inputPath,
						"-c",
						"copy",
						"-bsf:a",
						"aac_adtstoasc",
						"-movflags",
						"+faststart",
						tempOut,
					]
				: [
						"-hide_banner",
						"-y",
						"-i",
						inputPath,
						"-c",
						"copy",
						"-movflags",
						"+faststart",
						tempOut,
					];

		await runFfmpeg(ffmpegPath, args);

		if (!fs.existsSync(tempOut) || fs.statSync(tempOut).size === 0) {
			throw new Error("Remux produced an empty file");
		}

		if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
		fs.renameSync(tempOut, outputPath);
		return true;
	} catch (_error) {
		try {
			if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
		} catch (_cleanup) {}
		return false;
	}
}

/**
 * Ensures a downloaded lecture file is playable as MP4 when possible.
 * @param {string} filePath
 * @returns {Promise<{ path: string, container: string, remuxed: boolean, renamed: boolean }>}
 */
async function finalizeDownloadedMedia(filePath) {
	if (!filePath || !fs.existsSync(filePath)) {
		throw new Error("Downloaded media file is missing");
	}

	const size = fs.statSync(filePath).size;
	if (size === 0) {
		throw new Error("Downloaded media file is empty");
	}

	const container = detectContainer(filePath);

	if (container === "html" || container === "m3u8") {
		try {
			fs.unlinkSync(filePath);
		} catch (_error) {}
		throw new Error(
			`Download did not return media content (got ${container}). The URL may have expired — retry the lecture.`
		);
	}

	if (container === "mp4") {
		return { path: filePath, container, remuxed: false, renamed: false };
	}

	if (container === "mpegts" || container === "fmp4" || container === "unknown") {
		const remuxed = await remuxToMp4(
			filePath,
			filePath,
			container === "unknown" ? "mpegts" : container
		);
		if (remuxed) {
			return { path: filePath, container: "mp4", remuxed: true, renamed: false };
		}

		if (container === "mpegts") {
			const tsPath = filePath.replace(/\.mp4$/i, ".ts");
			if (tsPath !== filePath) {
				if (fs.existsSync(tsPath)) fs.unlinkSync(tsPath);
				fs.renameSync(filePath, tsPath);
				return { path: tsPath, container: "mpegts", remuxed: false, renamed: true };
			}
		}
	}

	return { path: filePath, container, remuxed: false, renamed: false };
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function isValidMediaFile(filePath) {
	const container = detectContainer(filePath);
	return container === "mp4" || container === "fmp4" || container === "mpegts";
}

module.exports = {
	detectContainer,
	detectContainerFromBuffer,
	finalizeDownloadedMedia,
	isValidMediaFile,
	remuxToMp4,
	resolveFfmpegPath,
};

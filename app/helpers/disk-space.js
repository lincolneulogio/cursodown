"use strict";

/**
 * Cross-platform free/used disk space for a path's volume.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

/**
 * @param {string} targetPath
 * @returns {{ freeBytes: number, totalBytes: number, usedBytes: number } | null}
 */
function getVolumeSpace(targetPath) {
	const resolved = path.resolve(targetPath || process.cwd());
	try {
		if (typeof fs.statfsSync === "function") {
			const st = fs.statfsSync(resolved);
			const bsize = Number(st.bsize) || 0;
			const freeBytes = bsize * Number(st.bavail ?? st.bfree ?? 0);
			const totalBytes = bsize * Number(st.blocks ?? 0);
			return {
				freeBytes,
				totalBytes,
				usedBytes: Math.max(0, totalBytes - freeBytes),
			};
		}
	} catch (_error) {
		/* fallback below */
	}

	if (process.platform === "win32") {
		try {
			const drive = path.parse(resolved).root.replace(/\\/g, "");
			const ps = [
				"-NoProfile",
				"-Command",
				`(Get-PSDrive -Name '${drive.replace(":", "")}').Free; (Get-PSDrive -Name '${drive.replace(":", "")}').Used`,
			];
			const out = execFileSync("powershell.exe", ps, {
				encoding: "utf8",
				windowsHide: true,
				timeout: 5000,
			});
			const lines = String(out)
				.trim()
				.split(/\r?\n/)
				.map((l) => Number(String(l).trim()))
				.filter((n) => Number.isFinite(n));
			if (lines.length >= 2) {
				const freeBytes = lines[0];
				const usedBytes = lines[1];
				return {
					freeBytes,
					usedBytes,
					totalBytes: freeBytes + usedBytes,
				};
			}
		} catch (_error) {
			return null;
		}
	}

	if (process.platform === "darwin" || process.platform === "linux") {
		try {
			const out = execFileSync("df", ["-k", resolved], {
				encoding: "utf8",
				timeout: 5000,
			});
			const lines = String(out).trim().split(/\r?\n/);
			const parts = (lines[lines.length - 1] || "").split(/\s+/);
			if (parts.length >= 4) {
				const totalKb = Number(parts[1]);
				const usedKb = Number(parts[2]);
				const freeKb = Number(parts[3]);
				return {
					totalBytes: totalKb * 1024,
					usedBytes: usedKb * 1024,
					freeBytes: freeKb * 1024,
				};
			}
		} catch (_error) {
			return null;
		}
	}

	return null;
}

/**
 * Recursive folder size (bytes).
 * @param {string} rootDir
 * @returns {number}
 */
function folderSizeBytes(rootDir) {
	if (!rootDir || !fs.existsSync(rootDir)) return 0;
	let total = 0;
	const stack = [rootDir];
	while (stack.length) {
		const current = stack.pop();
		let entries;
		try {
			entries = fs.readdirSync(current, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) stack.push(full);
			else if (entry.isFile()) {
				try {
					total += fs.statSync(full).size;
				} catch {
					/* ignore */
				}
			}
		}
	}
	return total;
}

module.exports = { getVolumeSpace, folderSizeBytes };

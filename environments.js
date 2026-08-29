const fs = require("fs");
const path = require("path");

/**
 * Optional .env loader for local/dev.
 * Packaged builds must not crash if .env is missing (SENTRY_DSN can stay empty).
 */
const envPath = path.join(__dirname, ".env");

if (fs.existsSync(envPath)) {
	const envFile = fs.readFileSync(envPath, "utf-8");
	const lines = envFile.split(/\r?\n/);

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const separator = trimmed.indexOf("=");
		if (separator <= 0) continue;

		const key = trimmed.slice(0, separator).trim();
		const value = trimmed.slice(separator + 1).trim();
		if (key && process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}

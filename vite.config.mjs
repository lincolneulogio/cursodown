import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: path.resolve(__dirname, "src/renderer"),
	base: "./",
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src/renderer"),
			"@shared": path.resolve(__dirname, "src/shared"),
		},
	},
	server: {
		port: 5173,
		strictPort: true,
	},
	build: {
		outDir: path.resolve(__dirname, "dist/renderer"),
		emptyOutDir: true,
		sourcemap: true,
	},
});

const UdemyService = require("./udemy.service");
const M3U8Service = require("./m3u8.service");
const DownloadQueue = require("./download-queue.service");
const LibraryService = require("./library.service");
const DownloadService = require("./download.service");

module.exports = {
	default: UdemyService,
	M3U8Service,
	DownloadQueue,
	LibraryService,
	DownloadService,
};

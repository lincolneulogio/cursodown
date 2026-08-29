"use strict";

const fs = require("fs");
const sanitize = require("sanitize-filename");
const { getSettingsStore } = require("./settings-store");

const Settings = getSettingsStore();

const utils = {
	isNumber: (n) => {
		return !isNaN(parseFloat(n)) && isFinite(n);
	},

	toBoolean: (value) => {
		return utils.isNumber(value) ? !/^0$/i.test(value) : /^true$/i.test(value);
	},

	/**
	 * Normalizes Udemy session credentials.
	 * Accepts a raw access_token, "Bearer <token>", or "access_token:client_id".
	 *
	 * @param {string|null|undefined} raw
	 * @returns {{ accessToken: string|null, clientId: string|null }}
	 */
	parseUdemyCredentials: (raw) => {
		if (raw == null) {
			return { accessToken: null, clientId: null };
		}

		let value = String(raw)
			.trim()
			.replace(/^["']|["']$/g, "");
		if (!value) {
			return { accessToken: null, clientId: null };
		}

		if (/^bearer\s+/i.test(value)) {
			value = value.replace(/^bearer\s+/i, "").trim();
		}

		let accessToken = value;
		let clientId = null;
		const separator = value.lastIndexOf(":");

		if (separator > 0) {
			const maybeToken = value.slice(0, separator).trim();
			const maybeClientId = value.slice(separator + 1).trim();
			const looksLikeClientId = /^[A-Za-z0-9_-]{6,32}$/.test(maybeClientId);

			if (maybeToken && looksLikeClientId) {
				accessToken = maybeToken;
				clientId = maybeClientId;
			}
		}

		return { accessToken: accessToken || null, clientId };
	},

	/**
	 * This function takes a string parameter property that represents the property by which the array of objects will be sorted.
	 * The function returns another function that will be used to sort the array of objects.
	 *
	 * If the property starts with a hyphen (-), the function will sort the array in descending order.
	 * Otherwise, it will sort in ascending order.
	 *
	 * @param property The name of the property to sort by. Use a minus sign prefix to sort in descending order.
	 * @returns `Function` A function that can be passed to the sort() method of an array to sort it by the specified property.
	 * @example
	 *
	 * ```javascript
	 *   myArray = [
	 *     {name: 'A', age: 18, univerty: 'lorem ipsum dolor sit amet'}
	 *     {name: 'C', age: 22, univerty: 'lorem ipsum dolor sit amet'}
	 *     {name: 'B', age: 16, univerty: 'lorem ipsum dolor sit amet'}
	 *   ]
	 *   myArray.sort(utils.dynamicSort('age'));  // Sorts ascending by age
	 *   myArray.sort(utils.dynamicSort('-age')); // Sorts descending by age
	 * ```
	 */
	dynamicSort: (property) => {
		var sortOrder = 1;

		if (property[0] === "-") {
			sortOrder = -1;
			property = property.substr(1);
		}

		return function (a, b) {
			if (sortOrder == -1) {
				return b[property].localeCompare(a[property]);
			} else {
				return a[property].localeCompare(b[property]);
			}
		};
	},

	/**
	 * Pads a number with leading zeros to match the number of digits in a given maximum value.
	 *
	 * @param num The number to be padded with leading zeros.
	 * @param max The maximum value for which the number of digits will be used to determine the padding length
	 *
	 * @returns `string` the input number padded with leading zeros to match the number of digits in the maximum value.
	 *
	 * @example
	 * ```js
	 * console.log(zeroPad(2, 9)); // "2"
	 * console.log(zeroPad(2, 10)); // "02"
	 * ```
	 */
	zeroPad: (num, max) => {
		return num.toString().padStart(Math.floor(Math.log10(max) + 1), "0");
	},

	/**
	 * Generates a string name based on the given index with or without leading zero, count, name, separatorIndex and optional path.
	 *
	 * @param {number} index The index of the sequence.
	 * @param {number} count The total count of the sequence.
	 * @param {string} name The name of the string.
	 * @param {string} [separatorIndex='. '] - The separator index used between the index and the name.
	 * @param {string|null} [path=null] The optional path to the sequence.
	 * @return {object} An object containing the generated name and full path of the sequence.
	 */
	getSequenceName: (index, count, name, separatorIndex = ". ", path = null) => {
		const indexName = sanitize(`${index}${separatorIndex}${name}`);
		const indexPath = path ? `${path}/${indexName}` : indexName;

		const sequence = utils.zeroPad(index, count);
		const sequenceName = `${sequence}${separatorIndex}${name}`;
		const sequencePath = path ? `${path}/${sequenceName}` : sequenceName;

		if (indexPath === sequencePath) {
			return { name: indexName, fullPath: indexPath };
		} else {
			if (Boolean(Settings.download.seqZeroLeft)) {
				// if it exists then rename it with leading zero
				if (fs.existsSync(indexPath)) {
					fs.renameSync(indexPath, sequencePath);
				}

				return { name: sequenceName, fullPath: sequencePath };
			} else {
				// if it exists then rename it without leading zero
				if (fs.existsSync(sequencePath)) {
					fs.renameSync(sequencePath, indexPath);
				}

				return { name: indexName, fullPath: indexPath };
			}
		}
	},

	/**
	 * Calculates the download speed given the input speed in kilobytes per second.
	 *
	 * @param {number} bytes - The download speed in kilobytes per second.
	 * @return {Object} The download speed value and unit.
	 */
	getDownloadSpeed: (bytes) => {
		const BYTES_PER_KB = 1024;
		const UNITS = ["B/s", "KB/s", "MB/s", "GB/s"];

		let speed = bytes;
		let unitIndex = 0;

		if (speed >= BYTES_PER_KB) {
			unitIndex = speed >= BYTES_PER_KB ** 3 ? 3 : speed >= BYTES_PER_KB ** 2 ? 2 : 1;
			speed /= BYTES_PER_KB ** unitIndex;
		}

		return {
			value: Number(speed.toFixed(2)),
			unit: UNITS[unitIndex],
		};
	},

	paginate: (array, page_size, page_number) => {
		// human-readable page numbers usually start with 1, so we reduce 1 in the first argument
		return array.slice((page_number - 1) * page_size, page_number * page_size);
	},

	sleep: (ms) => {
		return new Promise((resolve) => setTimeout(resolve, ms));
	},

	newError(name, message = "") {
		const error = new Error();
		error.name = name;
		error.message = message;
		return error;
	},
	/**
	 * Returns the value in the given object that is closest to the target value.
	 *
	 * @param {Object} obj - The object containing the values to compare.
	 * @param {number} target - The target value to find the closest match for.
	 * @return {*} The value in the object that is closest to the target value.
	 */
	getClosestValue(obj, target) {
		const keys = Object.keys(obj).map(Number); // Converte as chaves para números
		const closestKey = keys.reduce((prev, curr) => (Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev));
		return { key: closestKey, value: obj[closestKey] };
	},
};

module.exports = utils;

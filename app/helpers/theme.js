"use strict";

const Theme = {
	DARK: "dark",
	LIGHT: "light",

	normalize(value) {
		return value === Theme.LIGHT ? Theme.LIGHT : Theme.DARK;
	},

	apply(value) {
		const theme = Theme.normalize(value);
		const root = document.documentElement;
		root.setAttribute("data-theme", theme);
		if (document.body) {
			document.body.setAttribute("data-theme", theme);
			document.body.classList.toggle("theme-dark", theme === Theme.DARK);
			document.body.classList.toggle("theme-light", theme === Theme.LIGHT);
		}
		return theme;
	},
};

module.exports = Theme;

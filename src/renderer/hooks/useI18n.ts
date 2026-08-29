import { useCallback } from "react";
import { getUdeler } from "./useUdeler";

/**
 * Spanish UI labels via udeler.i18n.translate.
 * Falls back to the English key when translation is missing.
 */
export function useI18n(): {
	t: (key: string) => string;
	language: string;
	languages: string[];
} {
	const t = useCallback((key: string): string => {
		const api = getUdeler();
		if (!api?.i18n?.translate) {
			return key;
		}
		try {
			const value = api.i18n.translate(key);
			if (!value || value.trim() === "") {
				return key;
			}
			return value;
		} catch {
			return key;
		}
	}, []);

	const api = getUdeler();
	const language = api?.i18n?.getLanguage?.() ?? "Español";
	const languages = api?.i18n?.getLanguages?.() ?? ["Español"];

	return { t, language, languages };
}

import { useMemo } from "react";
import type { UdelerBridge } from "../../shared/udeler.d.ts";

export function getUdeler(): UdelerBridge | null {
	if (typeof window === "undefined") {
		return null;
	}
	return window.udeler ?? null;
}

/** Safe accessor for the Electron preload bridge. */
export function useUdeler(): UdelerBridge | null {
	return useMemo(() => getUdeler(), []);
}

export function requireUdeler(): UdelerBridge {
	const api = getUdeler();
	if (!api) {
		throw new Error("window.udeler is not available");
	}
	return api;
}

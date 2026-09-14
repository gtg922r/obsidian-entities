import { moment } from "obsidian";

/** Numeric week fragments are distinct from ordinary natural language, even when invalid. */
export type ExplicitWeek = { kind: "ordinary" } | { kind: "invalid" } | { kind: "valid"; date: moment.Moment };

/** Parse complete ISO weeks without allowing NLP to reinterpret incomplete numeric forms. */
export function classifyExplicitWeek(query: string, now: moment.Moment): ExplicitWeek {
	const text = query.trim();
	const match = /^(?:(\d{4}|\d{2})[-\s]?)?(?:w|wk|week)\s?(\d{1,2})$/i.exec(text);
	if (!match) {
		// Numeric markers anywhere catch stray prefixes/suffixes; bare markers must be the whole phrase.
		const numericFragment = /\b(?:week|wk|w)\s*[-+]?\s*\d|\d[-\s]*(?:week|wk|w)(?![a-z])/i.test(text);
		const bareMarker = /^(?:\d+[-\s]*)?(?:week|wk|w)[-\s]*$/i.test(text);
		return { kind: numericFragment || bareMarker ? "invalid" : "ordinary" };
	}
	const week = Number(match[2]);
	let year = match[1] ? Number(match[1].length === 2 ? `20${match[1]}` : match[1]) : now.isoWeekYear();
	if (!match[1] && week < now.isoWeek() - 4) year++;
	const canonical = `${String(year).padStart(4, "0")}-W${String(week).padStart(2, "0")}-1`;
	const date = moment(canonical, "GGGG-[W]WW-E", true);
	return date.isValid() && date.isoWeekYear() === year && date.isoWeek() === week && date.isoWeekday() === 1
		? { kind: "valid", date } : { kind: "invalid" };
}

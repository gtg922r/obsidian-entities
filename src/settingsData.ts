/** Deeply copy plain settings data, including optional fields in provider defaults. */
export function cloneSettings<T>(value: T): T {
	if (Array.isArray(value)) return value.map(item => cloneSettings(item)) as T;
	if (value !== null && typeof value === "object") {
		const result = { ...value };
		for (const key of Object.keys(result) as (keyof T)[]) {
			result[key] = cloneSettings(result[key]);
		}
		return result;
	}
	return value;
}

/** Create opaque IDs without relying on crypto.randomUUID or provider attributes. */
export function createProviderInstanceId(): string {
	const bytes = new Uint8Array(16);
	window.crypto.getRandomValues(bytes);
	return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

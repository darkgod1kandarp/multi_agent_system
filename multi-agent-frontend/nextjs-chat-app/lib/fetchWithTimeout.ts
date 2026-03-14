const DEFAULT_TIMEOUT_MS = 6 * 60 * 1000; // 6 minutes

type FetchArgs = Parameters<typeof fetch>;

export async function fetchWithTimeout(
    input: FetchArgs[0],
    init: FetchArgs[1] = {},
    timeoutMs: number = DEFAULT_TIMEOUT_MS
) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (init.signal) {
        init.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

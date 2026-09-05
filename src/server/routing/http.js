import { RoutingProviderError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 12_000;

export async function fetchJson(
  provider,
  url,
  { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, ...options } = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...headers
      },
      signal: controller.signal
    });

    const responseText = await response.text();
    let payload;

    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      throw new RoutingProviderError(provider, `${provider} returned an unreadable response.`, {
        status: 502,
        details: { upstreamStatus: response.status }
      });
    }

    if (!response.ok) {
      const upstreamMessage =
        payload?.message ?? payload?.error?.message ?? payload?.error ?? response.statusText;
      throw new RoutingProviderError(provider, `${provider} request failed: ${upstreamMessage}`, {
        status: response.status >= 400 && response.status < 500 ? 422 : 502,
        details: { upstreamStatus: response.status }
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof RoutingProviderError) throw error;

    const timedOut = error?.name === 'AbortError';
    throw new RoutingProviderError(
      provider,
      timedOut ? `${provider} timed out.` : `${provider} is unavailable.`,
      { cause: error, details: timedOut ? { timeoutMs } : undefined }
    );
  } finally {
    clearTimeout(timeout);
  }
}

type JsonFetch = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

// Keep the timeout active while reading the response body, and clear it on
// every exit. Expo wraps aborts in FetchError, so inspect our signal instead.
export async function requestJson<T>(
  url: string,
  init: RequestInit,
  fetcher: JsonFetch,
  timeoutMs = 65000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Awaited<ReturnType<JsonFetch>>;
    try {
      response = await fetcher(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw error;
      if (error instanceof Error && /unsupported formdata/i.test(error.message))
        throw new Error(
          "The photo could not be prepared for upload. Choose it again, and make sure the app is up to date.",
        );
      throw new Error(
        `Can't reach your store server. Check your connection and EXPO_PUBLIC_API_URL (${new URL(url).origin}).`,
      );
    }
    let data;
    try {
      data = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw Object.assign(
        new Error("The server returned an unexpected response. Please retry."),
        { status: response.status },
      );
    }
    if (!response.ok)
      throw Object.assign(
        new Error(data?.error || "Something went wrong. Please try again."),
        { status: response.status },
      );
    return data as T;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        "The request took too long. Please try again with a stable connection.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

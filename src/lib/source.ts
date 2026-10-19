const MAX_TITLE = 200;
const MAX_URL = 2000;

export interface SourceDetails {
  title: string | null;
  sourceUrl: string | null;
}

/**
 * Cleans the optional title and link of a source: blank becomes null, and the link must be an
 * http(s) URL (it is rendered as a clickable link, so other schemes such as javascript: are refused).
 */
export function parseSourceDetails(title: string | null | undefined, url: string | null | undefined): SourceDetails {
  const cleanTitle = title?.trim() || null;
  if (cleanTitle && cleanTitle.length > MAX_TITLE) throw new Error(`Title is too long (max ${MAX_TITLE} characters)`);

  const rawUrl = url?.trim();
  if (!rawUrl) return { title: cleanTitle, sourceUrl: null };
  if (rawUrl.length > MAX_URL) throw new Error("Link is too long");
  let parsed: URL;
  try {
    // A bare "example.com/article" is accepted as https.
    parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    throw new Error("Link is not a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Link must start with http:// or https://");
  return { title: cleanTitle, sourceUrl: parsed.toString() };
}

/** The host of a link without "www.", for compact display. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Visit counting with Umami, self-hosted on the maintainer's own server (D-052).
 * Only a production build loads it, so previews, local development and test
 * builds send nothing. The privacy page describes it; change both together.
 */
export const UMAMI = {
  src: 'https://data.aikoworks.com/script.js',
  websiteId: 'fca304d5-f882-41a9-aa2d-c5582956fa8f',
} as const

/**
 * Umami counts a click on any element carrying `data-umami-event`, with its
 * `data-umami-event-*` attributes as the event's properties (D-054). For a link
 * it posts the event and then follows the link. Without the script, as in every
 * build but production, the attributes do nothing.
 */
export const DOWNLOAD_EVENTS = {
  /** An installer link on /download/. */
  installer: 'download',
  /** The homepage button that leads to /download/. */
  page: 'download-page',
} as const

export function umamiEvent(
  name: (typeof DOWNLOAD_EVENTS)[keyof typeof DOWNLOAD_EVENTS],
  properties: Record<string, string>,
): Record<string, string> {
  const attributes: Record<string, string> = { 'data-umami-event': name }
  for (const [key, value] of Object.entries(properties))
    attributes[`data-umami-event-${key}`] = value
  return attributes
}

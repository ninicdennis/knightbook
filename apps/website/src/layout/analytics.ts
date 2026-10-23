/**
 * Visit counting with Umami, self-hosted on the maintainer's own server (D-052).
 * Only a production build loads it, so previews, local development and test
 * builds send nothing. The privacy page describes it; change both together.
 */
export const UMAMI = {
  src: 'https://data.aikoworks.com/script.js',
  websiteId: 'fca304d5-f882-41a9-aa2d-c5582956fa8f',
} as const

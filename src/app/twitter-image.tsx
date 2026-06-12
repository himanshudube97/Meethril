// Re-use the OpenGraph card for the Twitter/X share image. Next.js does not
// auto-derive twitter:image from opengraph-image, so re-export the same
// generator here to guarantee the X card renders with media.
export { alt, size, contentType, default } from './opengraph-image'

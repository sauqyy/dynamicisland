/**
 * The Universitas Indonesia (Fasilkom) build. Off in the regular build, which then has no Verify Student card,
 * no Campus pages and no campus release notes. Turn it on with VITE_CAMPUS=1 (see package.json, build:ui).
 */
export const CAMPUS = import.meta.env.VITE_CAMPUS === '1'

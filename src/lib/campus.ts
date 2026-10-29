/**
 * The Universitas Indonesia (Fasilkom) build. Off in the regular build, which then has no Verify Student card,
 * no Campus pages and no campus release notes. Turn it on with VITE_CAMPUS=1 (see package.json, build:ui).
 */
// the browser dev server (npm run dev) shows the Campus pages too, so the SCELE demo can be tried
// there without the ui mode; ?nocampus shows the regular build. In a production build DEV is false,
// so this is VITE_CAMPUS alone. The same check is written out where a file must not import this one.
export const CAMPUS = import.meta.env.VITE_CAMPUS === '1' || (import.meta.env.DEV && !('__TAURI_INTERNALS__' in window) && !location.search.includes('nocampus'))

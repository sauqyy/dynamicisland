//! Fullscreen detection for the foreground window.

/// macOS puts fullscreen apps on their own Space, which the island's window doesn't follow,
/// so there is nothing to hide and nothing to detect here.
pub fn foreground_is_fullscreen() -> bool {
    false
}

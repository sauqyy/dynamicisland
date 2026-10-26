//! macOS window tweaks that Tauri has no API for: sit above the menu bar on every Space.
use std::ffi::{c_char, c_void};

use tauri::WebviewWindow;

unsafe extern "C" {
    fn sel_registerName(name: *const c_char) -> *mut c_void;
    // Real signature is variadic-ish; it is cast to the exact one at each call site.
    fn objc_msgSend();
}

/// NSStatusWindowLevel: above normal windows and the menu bar.
const STATUS_WINDOW_LEVEL: isize = 25;
/// canJoinAllSpaces | stationary | fullScreenAuxiliary
const COLLECTION_BEHAVIOR: usize = (1 << 0) | (1 << 4) | (1 << 8);

pub fn float_above_menu_bar(window: &WebviewWindow) {
    let Ok(ns_window) = window.ns_window() else { return };
    let ns_window = ns_window as *mut c_void;
    unsafe {
        let send_isize: unsafe extern "C" fn(*mut c_void, *mut c_void, isize) =
            std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
        let send_usize: unsafe extern "C" fn(*mut c_void, *mut c_void, usize) =
            std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
        send_isize(ns_window, sel_registerName(c"setLevel:".as_ptr()), STATUS_WINDOW_LEVEL);
        send_usize(
            ns_window,
            sel_registerName(c"setCollectionBehavior:".as_ptr()),
            COLLECTION_BEHAVIOR,
        );
    }
}

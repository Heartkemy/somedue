//! Optional global Quick Entry. No shortcut is registered until the user chooses one.
//! Reference: https://v2.tauri.app/plugin/global-shortcut/
use std::{str::FromStr, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[derive(Default)]
pub(crate) struct Registration {
    shortcut: Option<Shortcut>,
    label: String,
}
#[derive(Default)]
pub(crate) struct QuickEntryState(pub Mutex<Registration>);

pub(crate) fn validate_shortcut(value: &str) -> Result<Option<Shortcut>, String> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if value.len() > 100 || value.chars().any(char::is_control) {
        return Err(
            "Enter a shortcut such as CommandOrControl+Shift+Space, or leave it blank to disable."
                .into(),
        );
    }
    // Avoid consuming bare typing keys or Shift-only combinations globally.
    let pieces: Vec<_> = value.split('+').map(str::trim).collect();
    if pieces.len() < 2
        || !pieces[..pieces.len() - 1].iter().any(|part| {
            matches!(
                part.to_ascii_lowercase().as_str(),
                "command"
                    | "cmd"
                    | "super"
                    | "meta"
                    | "control"
                    | "ctrl"
                    | "commandorcontrol"
                    | "cmdorctrl"
                    | "alt"
                    | "option"
            )
        })
    {
        return Err("A global shortcut must include Command, Control, or Option so ordinary typing remains available.".into());
    }
    Shortcut::from_str(value).map(Some).map_err(|_| {
        "Invalid shortcut. Try CommandOrControl+Shift+Space, or leave it blank to disable.".into()
    })
}

/// Register the new shortcut first. Failure never unregisters a working previous shortcut.
fn transition(
    state: &mut Registration,
    label: &str,
    mut register: impl FnMut(Shortcut) -> Result<(), String>,
    mut unregister: impl FnMut(Shortcut) -> Result<(), String>,
    mut persist: impl FnMut(&str) -> Result<(), String>,
) -> Result<String, String> {
    let next = validate_shortcut(label)?;
    let label = label.trim();
    if next == state.shortcut {
        persist(label)?;
        state.label = label.to_owned();
        return Ok(label.to_owned());
    }
    if let Some(shortcut) = next {
        register(shortcut)?;
    }
    if let Err(error) = persist(label) {
        if let Some(shortcut) = next {
            if unregister(shortcut).is_err() {
                return Err(format!("{error} The newly registered shortcut could not be released; restart the app to restore the previous setting."));
            }
        }
        return Err(error);
    }
    if let Some(old) = state.shortcut {
        if let Err(error) = unregister(old) {
            let rollback_saved = persist(&state.label);
            let rollback_registered = next.map(&mut unregister).transpose();
            if rollback_saved.is_err() || rollback_registered.is_err() {
                return Err(format!(
                    "{error} Shortcut rollback was incomplete; restart the app and check Settings."
                ));
            }
            return Err(error);
        }
    }
    state.shortcut = next;
    state.label = label.to_owned();
    Ok(label.to_owned())
}
pub(crate) fn configure(
    app: &AppHandle,
    label: &str,
    persist: impl FnMut(&str) -> Result<(), String>,
) -> Result<String, String> {
    let state = app.state::<QuickEntryState>();
    let mut registration = state
        .0
        .lock()
        .map_err(|_| "Shortcut settings are unavailable; restart the app.")?;
    transition(
        &mut registration,
        label,
        |shortcut| {
            app.global_shortcut().register(shortcut).map_err(|_|"This shortcut is unavailable or already used by another app. Your previous shortcut remains active.".into())
        },
        |shortcut| {
            app.global_shortcut()
                .unregister(shortcut)
                .map_err(|_| "macOS could not release the previous global shortcut.".into())
        },
        persist,
    )
}
pub(crate) fn open(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("quick-entry") {
        window
            .unminimize()
            .map_err(|_| "Could not restore Quick Entry")?;
        window.show().map_err(|_| "Could not show Quick Entry")?;
        window
            .set_focus()
            .map_err(|_| "Could not focus Quick Entry")?;
        let _ = window.emit("quick-entry-focus", ());
        return Ok(());
    }
    let window = WebviewWindowBuilder::new(
        app,
        "quick-entry",
        WebviewUrl::App("index.html?quick=1".into()),
    )
    .title("Quick Entry — Things")
    .inner_size(520., 420.)
    .min_inner_size(420., 360.)
    .center()
    .resizable(true)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .title_bar_style(tauri::TitleBarStyle::Overlay)
    .hidden_title(true)
    .focused(true)
    .build()
    .map_err(|_| "Could not open Quick Entry; try again from the File menu.")?;
    // Closing hides this reusable window; it never destroys its in-progress capture.
    let handle = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = handle.hide();
        }
    });
    Ok(())
}

pub(crate) fn validate_link(value: &str) -> Result<String, String> {
    if value.len() > 8192 || value.chars().any(char::is_control) {
        return Err("This link is invalid or too long.".into());
    }
    let url = reqwest::Url::parse(value.trim()).map_err(|_| "This link is invalid.")?;
    match url.scheme() {
        "http" | "https" if url.host_str().is_some() => Ok(url.to_string()),
        "mailto" if !url.path().trim().is_empty() => Ok(url.to_string()),
        _ => Err("Only web links and email links can be opened.".into()),
    }
}
pub(crate) fn open_link(value: &str) -> Result<(), String> {
    let url = validate_link(value)?;
    let status = std::process::Command::new("/usr/bin/open")
        .arg("--")
        .arg(url)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|_| "macOS could not open this link.")?;
    if !status.success() {
        return Err(
            "macOS could not open this link. Check that a browser or email app is configured."
                .into(),
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    #[test]
    fn shortcut_requires_modifier_and_known_key() {
        assert!(validate_shortcut("").unwrap().is_none());
        assert!(validate_shortcut("CommandOrControl+Shift+Space").is_ok());
        for invalid in ["A", "Shift+A", "Command+NotAKey", "Control+\nA", "Command+"] {
            assert!(validate_shortcut(invalid).is_err(), "{invalid}");
        }
    }
    #[test]
    fn failed_new_registration_preserves_previous_shortcut_and_preferences() {
        let mut state = Registration {
            shortcut: validate_shortcut("Command+Shift+N").unwrap(),
            label: "Command+Shift+N".into(),
        };
        let old = state.shortcut;
        let calls = RefCell::new(Vec::new());
        assert!(transition(
            &mut state,
            "Command+Shift+Space",
            |_| {
                calls.borrow_mut().push("register");
                Err("occupied".into())
            },
            |_| {
                calls.borrow_mut().push("unregister");
                Ok(())
            },
            |_| {
                calls.borrow_mut().push("persist");
                Ok(())
            }
        )
        .is_err());
        assert_eq!(state.shortcut, old);
        assert_eq!(*calls.borrow(), vec!["register"]);
    }
    #[test]
    fn new_shortcut_is_registered_and_saved_before_previous_is_released() {
        let mut state = Registration {
            shortcut: validate_shortcut("Command+Shift+N").unwrap(),
            label: "Command+Shift+N".into(),
        };
        let calls = RefCell::new(Vec::new());
        transition(
            &mut state,
            "Command+Shift+Space",
            |_| {
                calls.borrow_mut().push("register");
                Ok(())
            },
            |_| {
                calls.borrow_mut().push("unregister");
                Ok(())
            },
            |_| {
                calls.borrow_mut().push("persist");
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(*calls.borrow(), vec!["register", "persist", "unregister"]);
    }
    #[test]
    fn disk_failure_releases_only_new_shortcut() {
        let old = validate_shortcut("Command+Shift+N").unwrap();
        let mut state = Registration {
            shortcut: old,
            label: "Command+Shift+N".into(),
        };
        let released = RefCell::new(Vec::new());
        assert!(transition(
            &mut state,
            "Command+Shift+Space",
            |_| Ok(()),
            |s| {
                released.borrow_mut().push(s);
                Ok(())
            },
            |_| Err("disk full".into())
        )
        .is_err());
        assert_eq!(state.shortcut, old);
        assert_eq!(released.borrow().len(), 1);
        assert_ne!(Some(released.borrow()[0]), old);
    }
    #[test]
    fn dangerous_and_malformed_link_schemes_are_rejected() {
        for allowed in [
            "https://example.com/path?q=value",
            "http://localhost:3000",
            "mailto:someone@example.com",
        ] {
            assert!(validate_link(allowed).is_ok());
        }
        for denied in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,test",
            "ssh://host",
            "things:///add?title=x",
            "https://",
            "mailto:",
            "https://example.com\nother",
        ] {
            assert!(validate_link(denied).is_err(), "{denied}");
        }
    }
}

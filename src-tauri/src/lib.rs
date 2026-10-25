mod cloud;
pub mod keychain;
mod quick_entry;
mod recurrence;
mod store;
mod workflow;
use serde_json::{json, Value};
use store::{Store, Workspace};
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex;
struct App {
    store: Store,
    account: String,
    workspace: Workspace,
    shortcut_error: Option<String>,
}
struct Shared(Mutex<App>);
fn view(a: &App) -> Value {
    json!({"entities":a.workspace.snapshot.entities.values().collect::<Vec<_>>(),"account":a.account,"pending":a.workspace.pending.len(),"blocked":a.workspace.pending.iter().any(|p|p.status!="queued"),"lastSync":a.workspace.last_sync,"shortcutError":a.shortcut_error,"preferences":a.store.config("preferences").and_then(|s|serde_json::from_str::<Value>(&s).ok()).unwrap_or(json!({}))})
}
fn save(a: &mut App, w: Workspace) -> Result<(), String> {
    a.store.save(&a.account, &w)?;
    a.workspace = w;
    Ok(())
}
fn credentials(account: &str) -> Result<(String, String), String> {
    let v: Value = serde_json::from_str(&keychain::get(account)?)
        .map_err(|_| "Saved credentials could not be read. Reconnect in Settings.")?;
    Ok((
        v["password"].as_str().ok_or("Missing password")?.into(),
        v["history"].as_str().ok_or("Missing history")?.into(),
    ))
}
#[tauri::command]
async fn load(state: State<'_, Shared>) -> Result<Value, String> {
    let a = state.0.lock().await;
    Ok(view(&a))
}
#[tauri::command]
async fn preferences(mut value: Value, state: State<'_, Shared>) -> Result<(), String> {
    if !value.is_object() {
        return Err("Invalid settings".into());
    }
    let a = state.0.lock().await;
    // Registration and persistence are one native operation; generic appearance edits cannot bypass it.
    let current = a
        .store
        .config("preferences")
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .unwrap_or(json!({}));
    value["quickShortcut"] = current.get("quickShortcut").cloned().unwrap_or(json!(""));
    a.store.set_config("preferences", &value.to_string())
}
#[tauri::command]
async fn quick_entry(app: tauri::AppHandle) -> Result<(), String> {
    quick_entry::open(&app)
}
#[tauri::command]
async fn configure_shortcut(
    shortcut: String,
    app: tauri::AppHandle,
    state: State<'_, Shared>,
) -> Result<String, String> {
    let mut a = state.0.lock().await;
    let saved = quick_entry::configure(&app, &shortcut, |label| {
        let mut preferences = a
            .store
            .config("preferences")
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .filter(Value::is_object)
            .unwrap_or(json!({}));
        preferences["quickShortcut"] = json!(label);
        a.store.set_config("preferences", &preferences.to_string())
    })?;
    a.shortcut_error = None;
    Ok(saved)
}
#[tauri::command]
async fn open_link(url: String) -> Result<(), String> {
    quick_entry::open_link(&url)
}
#[tauri::command]
async fn notify_reminder(message: String) -> Result<(), String> {
    if message.is_empty() || message.len() > 10000 {
        return Err("Invalid reminder message".into());
    }
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("/usr/bin/osascript")
            .args(["-e", "on run argv\ndisplay notification (item 1 of argv) with title \"Somedue\"\nend run", "--", &message])
            .status().map_err(|_| "Could not display the reminder notification")?;
        if !status.success() { return Err("macOS could not display the reminder notification. Check notification settings.".into()); }
    }
    Ok(())
}
#[tauri::command]
async fn connect(
    email: String,
    password: String,
    progress: tauri::ipc::Channel<cloud::TransferProgress>,
    state: State<'_, Shared>,
) -> Result<Value, String> {
    let mut a = state.0.lock().await;
    let email = email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return Err("Enter your Things Cloud email".into());
    }
    let mut cached = a.store.load(&email)?;
    // Earlier caches may lack a non-secret identity; recover it from Keychain when possible.
    if cached.history_fingerprint.is_none() {
        if let Ok((_, history)) = credentials(&email) {
            cached.history_fingerprint = Some(workflow::history_fingerprint(&history));
        }
    }
    let updates = progress.clone();
    let remote = cloud::pull_with_progress(
        &email,
        &password,
        Box::new(move |update| {
            let _ = updates.send(update);
        }),
    )
    .await?;
    let _ = progress.send(cloud::TransferProgress {
        stage: "saving",
        received_bytes: 0,
        items: remote.entities.len() as u64,
    });
    let next = workflow::attach(&cached, remote)?;
    let history = &next
        .authoritative
        .as_ref()
        .ok_or("Missing account state")?
        .history;
    keychain::set(
        &email,
        &json!({"password":password,"history":history}).to_string(),
    )?;
    a.store.save(&email, &next)?;
    a.store.set_config("account", &email)?;
    a.account = email;
    a.workspace = next;
    Ok(view(&a))
}
#[tauri::command]
async fn disconnect(state: State<'_, Shared>) -> Result<Value, String> {
    let mut a = state.0.lock().await;
    let local = a.store.load("local")?;
    if a.account != "local" {
        keychain::delete(&a.account)?;
    }
    a.store.set_config("account", "local")?;
    a.account = "local".into();
    a.workspace = local;
    Ok(view(&a))
}
#[tauri::command]
async fn mutate(changes: Value, confirm: bool, state: State<'_, Shared>) -> Result<Value, String> {
    let mut a = state.0.lock().await;
    let next = workflow::mutate(&a.workspace, changes, confirm, a.account != "local")?;
    save(&mut a, next)?;
    Ok(view(&a))
}
#[tauri::command]
async fn sync(state: State<'_, Shared>) -> Result<Value, String> {
    let mut a = state.0.lock().await;
    if a.account == "local" {
        return Ok(view(&a));
    }
    let email = a.account.clone();
    let (password, history) = credentials(&email)?;
    let mut remote = workflow::LiveRemote {
        email: &email,
        password: &password,
    };
    let persistence_account = email.clone();
    let App {
        store, workspace, ..
    } = &mut *a;
    let result = workflow::sync(&mut remote, &history, workspace, move |w| {
        store.save(&persistence_account, w)
    })
    .await;
    result?;
    Ok(view(&a))
}
#[tauri::command]
async fn resolve_drafts(confirm: bool, state: State<'_, Shared>) -> Result<Value, String> {
    if !confirm {
        return Err("Confirm that the cloud version should replace pending edits".into());
    }
    let mut a = state.0.lock().await;
    let (password, _) = credentials(&a.account)?;
    let remote = cloud::pull(&a.account, &password, None).await?;
    // Keep an exportable recovery copy before the explicitly authorized replacement.
    a.store.set_config(
        "recovery_backup",
        &serde_json::to_string(&a.workspace).map_err(|e| e.to_string())?,
    )?;
    keychain::set(
        &a.account,
        &json!({"password":password,"history":remote.history}).to_string(),
    )?;
    let next = Workspace {
        history_fingerprint: Some(workflow::history_fingerprint(&remote.history)),
        snapshot: remote.clone(),
        authoritative: Some(remote),
        pending: vec![],
        last_sync: Some(chrono::Utc::now().to_rfc3339()),
    };
    save(&mut a, next)?;
    Ok(view(&a))
}
#[tauri::command]
async fn export_data(state: State<'_, Shared>) -> Result<String, String> {
    let a = state.0.lock().await;
    serde_json::to_string_pretty(&json!({"format":"somedue-backup-v1","workspace":a.workspace,"recovery":a.store.config("recovery_backup").and_then(|s|serde_json::from_str::<Value>(&s).ok())})).map_err(|e|e.to_string())
}
pub fn run() {
    tauri::Builder::default()
        .manage(quick_entry::QuickEntryState::default())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(error) = quick_entry::open(&app) {
                                let _ = app.emit("quick-entry-error", error);
                            }
                        });
                    }
                })
                .build(),
        )
        .setup(|app| {
            let path = app.path().app_data_dir()?;
            std::fs::create_dir_all(&path)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700))?;
            }
            let store =
                Store::open(&path.join("workspace.sqlite")).map_err(std::io::Error::other)?;
            let account = store.config("account").unwrap_or("local".into());
            let workspace = store.load(&account).map_err(std::io::Error::other)?;
            let shortcut = store
                .config("preferences")
                .and_then(|s| serde_json::from_str::<Value>(&s).ok())
                .and_then(|p| p["quickShortcut"].as_str().map(str::to_owned))
                .unwrap_or_default();
            let shortcut_error = quick_entry::configure(app.handle(), &shortcut, |_| Ok(())).err();
            app.manage(Shared(Mutex::new(App {
                store,
                account,
                workspace,
                shortcut_error,
            })));
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
            let h = app.handle();
            let settings =
                MenuItem::with_id(h, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
            let new = MenuItem::with_id(h, "new", "New To-Do", true, Some("CmdOrCtrl+N"))?;
            let quick = MenuItem::with_id(h, "quick-entry", "Quick Entry…", true, None::<&str>)?;
            let project =
                MenuItem::with_id(h, "project", "New Project", true, Some("CmdOrCtrl+Alt+N"))?;
            let heading =
                MenuItem::with_id(h, "heading", "New Heading", true, Some("CmdOrCtrl+Shift+N"))?;
            let refresh =
                MenuItem::with_id(h, "sync", "Sync Now", true, Some("CmdOrCtrl+Shift+S"))?;
            let search = MenuItem::with_id(h, "search", "Search", true, Some("CmdOrCtrl+F"))?;
            let menu = Menu::with_items(
                h,
                &[
                    &Submenu::with_items(
                        h,
                        "Somedue",
                        true,
                        &[
                            &PredefinedMenuItem::about(h, None, None)?,
                            &settings,
                            &PredefinedMenuItem::separator(h)?,
                            &PredefinedMenuItem::hide(h, None)?,
                            &PredefinedMenuItem::quit(h, None)?,
                        ],
                    )?,
                    &Submenu::with_items(
                        h,
                        "File",
                        true,
                        &[&new, &quick, &project, &heading, &refresh],
                    )?,
                    &Submenu::with_items(
                        h,
                        "Edit",
                        true,
                        &[
                            &PredefinedMenuItem::undo(h, None)?,
                            &PredefinedMenuItem::redo(h, None)?,
                            &PredefinedMenuItem::cut(h, None)?,
                            &PredefinedMenuItem::copy(h, None)?,
                            &PredefinedMenuItem::paste(h, None)?,
                            &PredefinedMenuItem::select_all(h, None)?,
                        ],
                    )?,
                    &Submenu::with_items(
                        h,
                        "View",
                        true,
                        &[&search, &PredefinedMenuItem::fullscreen(h, None)?],
                    )?,
                ],
            )?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "quick-entry" {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = quick_entry::open(&app) {
                        let _ = app.emit("quick-entry-error", error);
                    }
                });
            } else {
                let _ = app.emit("menu-action", event.id().as_ref());
            }
        })
        .invoke_handler(tauri::generate_handler![
            load,
            preferences,
            connect,
            disconnect,
            mutate,
            sync,
            resolve_drafts,
            export_data,
            quick_entry,
            configure_shortcut,
            open_link,
            notify_reminder
        ])
        .run(tauri::generate_context!())
        .expect("Somedue could not start");
}

#[cfg(test)]
mod reminder_tests {
    use super::notify_reminder;
    #[tokio::test]
    async fn rejects_invalid_notification_messages_before_os_dispatch() {
        assert!(notify_reminder(String::new()).await.is_err());
        assert!(notify_reminder("x".repeat(10001)).await.is_err());
    }
}

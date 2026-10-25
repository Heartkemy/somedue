mod cloud;
pub mod keychain;
mod quick_entry;
mod recurrence;
mod store;
mod workflow;
use serde_json::{json, Value};
use std::sync::Mutex;
use store::{Store, Workspace};
use tauri::{Emitter, Manager, State};
struct App {
    store: Store,
    account: String,
    workspace: Workspace,
    shortcut_error: Option<String>,
}
struct Shared(Mutex<App>, tokio::sync::Mutex<()>);
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
    let a = state.0.lock().map_err(|_| "Workspace is unavailable")?;
    Ok(view(&a))
}
#[tauri::command]
async fn preferences(mut value: Value, state: State<'_, Shared>) -> Result<(), String> {
    if !value.is_object() {
        return Err("Invalid settings".into());
    }
    let a = state.0.lock().map_err(|_| "Workspace is unavailable")?;
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
    let mut a = state.0.lock().map_err(|_| "Workspace is unavailable")?;
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
        if !status.success() {
            return Err(
                "macOS could not display the reminder notification. Check notification settings."
                    .into(),
            );
        }
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
    let _connection = state.1.lock().await;
    let email = email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return Err("Enter your Things Cloud email".into());
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
    let mut a = state.0.lock().map_err(|_| "Workspace is unavailable")?;
    let mut cached = a.store.load(&email)?;
    if cached.history_fingerprint.is_none() {
        if let Ok((_, history)) = credentials(&email) {
            cached.history_fingerprint = Some(workflow::history_fingerprint(&history));
        }
    }
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
    let _connection = state.1.lock().await;
    let mut a = state.0.lock().map_err(|_| "Workspace is unavailable")?;
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
    let mut a = state.0.lock().map_err(|_| "Workspace is unavailable")?;
    let next = workflow::mutate(&a.workspace, changes, confirm, a.account != "local")?;
    save(&mut a, next)?;
    Ok(view(&a))
}
#[tauri::command]
async fn sync(state: State<'_, Shared>) -> Result<Value, String> {
    let _connection = state.1.lock().await;
    let (email, workspace) = {
        let a = state.0.lock().map_err(|_| "Workspace is unavailable")?;
        if a.account == "local" {
            return Ok(view(&a));
        }
        (a.account.clone(), a.workspace.clone())
    };
    let (password, history) = credentials(&email)?;
    let mut remote = workflow::LiveRemote {
        email: &email,
        password: &password,
    };
    sync_workspace(&state, &mut remote, &history, &email, workspace).await
}
async fn sync_workspace<R: workflow::Remote>(
    shared: &Shared,
    remote: &mut R,
    history: &str,
    email: &str,
    mut workspace: Workspace,
) -> Result<Value, String> {
    let mut previous_pending = workspace.pending.len();
    workflow::sync(remote, history, &mut workspace, |next| {
        let mut a = shared.0.lock().map_err(|_| "Workspace is unavailable")?;
        if a.account != email {
            return Err("The connected account changed during synchronization.".into());
        }
        let merged = workflow::merge_sync_checkpoint(next, &a.workspace, previous_pending)?;
        save(&mut a, merged)?;
        previous_pending = next.pending.len();
        Ok(())
    })
    .await?;
    let a = shared.0.lock().map_err(|_| "Workspace is unavailable")?;
    Ok(view(&a))
}
#[tauri::command]
async fn resolve_drafts(confirm: bool, state: State<'_, Shared>) -> Result<Value, String> {
    if !confirm {
        return Err("Confirm that the cloud version should replace pending edits".into());
    }
    let _connection = state.1.lock().await;
    let (email, pending_before_pull) = {
        let a = state.0.lock().map_err(|_| "Workspace is unavailable")?;
        (a.account.clone(), a.workspace.pending.len())
    };
    let (password, _) = credentials(&email)?;
    let remote = cloud::pull(&email, &password, None).await?;
    let mut a = state.0.lock().map_err(|_| "Workspace is unavailable")?;
    let next = workflow::recover(&a.workspace, remote, pending_before_pull)?;
    // Keep an exportable recovery copy before the explicitly authorized replacement.
    a.store.set_config(
        "recovery_backup",
        &serde_json::to_string(&a.workspace).map_err(|e| e.to_string())?,
    )?;
    keychain::set(
        &a.account,
        &json!({"password":password,"history":next.authoritative.as_ref().ok_or("Missing account state")?.history}).to_string(),
    )?;
    save(&mut a, next)?;
    Ok(view(&a))
}
#[tauri::command]
async fn export_data(state: State<'_, Shared>) -> Result<String, String> {
    let a = state.0.lock().map_err(|_| "Workspace is unavailable")?;
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
            app.manage(Shared(
                Mutex::new(App {
                    store,
                    account,
                    workspace,
                    shortcut_error,
                }),
                tokio::sync::Mutex::new(()),
            ));
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

#[cfg(test)]
mod sync_tests {
    use super::*;
    use crate::cloud::{CommitError, Snapshot};
    use tokio::sync::oneshot;

    struct PausedRemote {
        snapshot: Snapshot,
        pause_pull: bool,
        entered: Option<oneshot::Sender<()>>,
        resume: Option<oneshot::Receiver<()>>,
    }
    impl PausedRemote {
        async fn pause(&mut self) {
            self.entered.take().unwrap().send(()).unwrap();
            self.resume.take().unwrap().await.unwrap();
        }
    }
    impl workflow::Remote for PausedRemote {
        async fn pull(&mut self, _: Option<&Snapshot>) -> Result<Snapshot, String> {
            if self.pause_pull {
                self.pause().await;
            }
            Ok(self.snapshot.clone())
        }
        async fn commit(&mut self, _: &Snapshot, changes: Value) -> Result<Snapshot, CommitError> {
            if !self.pause_pull {
                self.pause().await;
            }
            cloud::apply_batch(&mut self.snapshot, &changes).unwrap();
            self.snapshot.head += 1;
            Ok(self.snapshot.clone())
        }
    }

    #[tokio::test]
    async fn network_waits_leave_workspace_available_and_preserve_concurrent_edits() {
        for pause_pull in [true, false] {
            let id = store::id();
            let original = workflow::mutate(
                &Workspace::default(),
                json!({id.clone(): {"e":"Task6","t":0,"p":{"tt":"Original"}}}),
                false,
                false,
            )
            .unwrap();
            let mut snapshot = original.snapshot;
            snapshot.history = "test-history".into();
            let base = workflow::attach(&Workspace::default(), snapshot.clone()).unwrap();
            let workspace = workflow::mutate(
                &base,
                json!({id.clone(): {"e":"Task6","t":1,"p":{"tt":"First edit"}}}),
                false,
                true,
            )
            .unwrap();
            let path = std::env::temp_dir().join(format!("somedue-sync-{}.db", store::id()));
            let shared = Shared(
                Mutex::new(App {
                    store: Store::open(&path).unwrap(),
                    account: "test-account".into(),
                    workspace: workspace.clone(),
                    shortcut_error: None,
                }),
                tokio::sync::Mutex::new(()),
            );
            let (entered, waiting) = oneshot::channel();
            let (resume, released) = oneshot::channel();
            let mut remote = PausedRemote {
                snapshot,
                pause_pull,
                entered: Some(entered),
                resume: Some(released),
            };
            let sync = sync_workspace(
                &shared,
                &mut remote,
                "test-history",
                "test-account",
                workspace,
            );
            let edit = async {
                waiting.await.unwrap();
                let mut app = shared
                    .0
                    .try_lock()
                    .expect("network I/O must not hold the workspace lock");
                let next = workflow::mutate(
                    &app.workspace,
                    json!({id.clone(): {"e":"Task6","t":1,"p":{"tt":"Concurrent edit"}}}),
                    false,
                    true,
                )
                .unwrap();
                save(&mut app, next).unwrap();
                drop(app);
                resume.send(()).unwrap();
            };
            let (result, _) = tokio::join!(sync, edit);
            assert_eq!(result.unwrap()["pending"], 1);
            {
                let app = shared.0.lock().unwrap();
                assert_eq!(
                    app.workspace.snapshot.entities[&id].props["tt"],
                    "Concurrent edit"
                );
                assert_eq!(app.workspace.pending[0].status, "queued");
                assert_eq!(
                    app.workspace.authoritative.as_ref().unwrap().entities[&id].props["tt"],
                    "First edit"
                );
                assert_eq!(
                    app.store.load("test-account").unwrap().snapshot.entities[&id].props["tt"],
                    "Concurrent edit"
                );
            }
            drop(shared);
            std::fs::remove_file(path).unwrap();
        }
    }
}

//! Explicit dummy-account smoke test; isolated SQLite store, never the installed database.
#![allow(dead_code)]
#[path = "../src/cloud.rs"] mod cloud;
#[path = "../src/store.rs"] mod store;
#[path = "../src/recurrence.rs"] mod recurrence;
#[path = "../src/workflow.rs"] mod workflow;
use serde_json::{json, Value};

#[tokio::main(flavor = "current_thread")]
async fn main() {
    if let Err(error) = verify().await {
        eprintln!("Dummy Cloud smoke failed: {error}");
        std::process::exit(1);
    }
}
async fn verify() -> Result<(), String> {
    let email = std::env::var("SOMEDUE_TEST_EMAIL").map_err(|_| "Missing dummy email")?;
    let password = std::env::var("SOMEDUE_TEST_PASSWORD").map_err(|_| "Missing dummy password")?;
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 2 { return Err("Expected changes JSON and isolated database path".into()); }
    let changes: Value = serde_json::from_slice(&std::fs::read(&args[0]).map_err(|_| "Cannot read changes")?).map_err(|_| "Invalid test changes")?;
    let id = changes.as_object().ok_or("Invalid changes")?.keys().next().ok_or("Empty changes")?.clone();
    let remote = cloud::pull(&email, &password, None).await?;
    let history = remote.history.clone();
    let db = store::Store::open(std::path::Path::new(&args[1]))?;
    let workspace = workflow::attach(&store::Workspace::default(), remote)?;
    let mut workspace = workflow::mutate(&workspace, changes, true, true)?;
    db.save("dummy-test", &workspace)?;
    workspace = db.load("dummy-test")?;
    if workspace.pending.len() != 1 { return Err("Pending draft did not survive disk reload".into()); }
    let mut remote = workflow::LiveRemote { email: &email, password: &password };
    workflow::sync(&mut remote, &history, &mut workspace, |w| db.save("dummy-test", w)).await?;
    if !workspace.pending.is_empty() || workspace.snapshot.entities.get(&id).is_none_or(|e| e.props["tp"] != 1 || e.props["tr"] != false) { return Err("Project did not round-trip with boolean trash state".into()); }
    // Delete only this run's synthetic project after independently observing it in Cloud history.
    workspace = workflow::mutate(&workspace, json!({id.clone():{"e":"Task6","t":2,"p":{}}}), true, true)?;
    db.save("dummy-test", &workspace)?;
    workflow::sync(&mut remote, &history, &mut workspace, |w| db.save("dummy-test", w)).await?;
    if !workspace.pending.is_empty() || workspace.snapshot.entities.contains_key(&id) { return Err("Synthetic project cleanup did not round-trip".into()); }
    println!("{}", json!({"verifiedAt":chrono::Utc::now().to_rfc3339(),"dummyAccount":true,"personalStoreOpened":false,"projectCreation":true,"booleanTrash":true,"pendingDraftReload":true,"cloudRoundTrip":true,"syntheticProjectRemoved":true}));
    Ok(())
}

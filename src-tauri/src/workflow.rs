//! Account/workspace lifecycle. These services are used by IPC and tested without a WebView.
use crate::{
    cloud::{self, CommitDisposition, CommitError, Snapshot},
    store::{self, Pending, Workspace},
};
use serde_json::Value;
use sha1::{Digest, Sha1};

pub(crate) trait Remote {
    async fn pull(&mut self, previous: Option<&Snapshot>) -> Result<Snapshot, String>;
    async fn commit(&mut self, current: &Snapshot, changes: Value)
        -> Result<Snapshot, CommitError>;
}
pub(crate) struct LiveRemote<'a> {
    pub email: &'a str,
    pub password: &'a str,
}
impl Remote for LiveRemote<'_> {
    async fn pull(&mut self, previous: Option<&Snapshot>) -> Result<Snapshot, String> {
        cloud::pull(self.email, self.password, previous).await
    }
    async fn commit(
        &mut self,
        current: &Snapshot,
        changes: Value,
    ) -> Result<Snapshot, CommitError> {
        cloud::commit_classified(self.email, self.password, current, changes).await
    }
}
pub(crate) fn history_fingerprint(history: &str) -> String {
    format!("{:x}", Sha1::digest(history.as_bytes()))
}

/// Reconnect cannot silently replay old drafts into a reset or different account history.
pub(crate) fn attach(workspace: &Workspace, remote: Snapshot) -> Result<Workspace, String> {
    if let Some(previous) = &workspace.history_fingerprint {
        if *previous != history_fingerprint(&remote.history) {
            return Err("This account's cloud history changed. Cached tasks and drafts were preserved. Export a backup and explicitly choose the cloud version in recovery before replacing them.".into());
        }
    } else if !workspace.pending.is_empty() && workspace.authoritative.is_some() {
        return Err("Saved drafts have no verifiable cloud-history identity. Export them before replacing this workspace through recovery.".into());
    }
    let mut next = workspace.clone();
    next.history_fingerprint = Some(history_fingerprint(&remote.history));
    next.authoritative = Some(remote);
    rebuild_view(&mut next)?;
    next.last_sync = Some(chrono::Utc::now().to_rfc3339());
    Ok(next)
}
pub(crate) fn rebuild_view(workspace: &mut Workspace) -> Result<(), String> {
    let Some(base) = workspace.authoritative.clone() else {
        return Ok(());
    };
    let mut view = base;
    for draft in &workspace.pending {
        store::apply(&mut view.entities, &draft.changes)?;
    }
    workspace.snapshot = view;
    Ok(())
}
fn checkpoint(
    workspace: &mut Workspace,
    mut next: Workspace,
    persist: &mut impl FnMut(&Workspace) -> Result<(), String>,
) -> Result<(), String> {
    rebuild_view(&mut next)?;
    persist(&next)?;
    *workspace = next;
    Ok(())
}
fn postcondition_met(pending: &Pending, remote: &Snapshot) -> bool {
    let Some(changes) = pending.changes.as_object() else {
        return false;
    };
    !changes.is_empty()
        && changes.iter().all(|(id, event)| {
            if event["t"].as_u64() == Some(2) {
                return !remote.entities.contains_key(id);
            }
            let Some(entity) = remote.entities.get(id) else {
                return false;
            };
            entity.kind == event["e"].as_str().unwrap_or("")
                && event["p"]
                    .as_object()
                    .is_some_and(|p| p.iter().all(|(k, v)| entity.props.get(k) == Some(v)))
        })
}

/// Network work owns a fixed prefix; edits queued since its last checkpoint stay local.
pub(crate) fn merge_sync_checkpoint(
    synced: &Workspace,
    current: &Workspace,
    previous_pending: usize,
) -> Result<Workspace, String> {
    let queued = current.pending.get(previous_pending..).ok_or(
        "Pending edits changed during synchronization; the current workspace was preserved.",
    )?;
    let mut next = synced.clone();
    next.pending.extend_from_slice(queued);
    rebuild_view(&mut next)?;
    Ok(next)
}

pub(crate) fn recover(
    current: &Workspace,
    remote: Snapshot,
    pending_before_pull: usize,
) -> Result<Workspace, String> {
    if current.pending.len() != pending_before_pull {
        return Err("New edits were saved while recovery was loading. Review your drafts and try again; nothing was replaced.".into());
    }
    Ok(Workspace {
        history_fingerprint: Some(history_fingerprint(&remote.history)),
        snapshot: remote.clone(),
        authoritative: Some(remote),
        pending: vec![],
        last_sync: Some(chrono::Utc::now().to_rfc3339()),
    })
}

/// The persisted `sending` state is the crash boundary: it is never automatically sent again.
/// A returned pre-send failure is explicitly reset to queued; uncertainty remains blocked.
pub(crate) async fn sync<R: Remote>(
    remote: &mut R,
    history: &str,
    workspace: &mut Workspace,
    mut persist: impl FnMut(&Workspace) -> Result<(), String>,
) -> Result<(), String> {
    if let Some(fingerprint) = &workspace.history_fingerprint {
        if *fingerprint != history_fingerprint(history) {
            return Err("Saved credentials belong to another cloud history. Reconnect before syncing; drafts are unchanged.".into());
        }
    }
    let mut base = if let Some(base) = &workspace.authoritative {
        base.clone()
    } else {
        // One-time compatibility with caches made before authoritative state was separated.
        let mut base = workspace.snapshot.clone();
        for draft in workspace.pending.iter().rev() {
            for (id, old) in &draft.base {
                match old {
                    Some(entity) => {
                        base.entities.insert(id.clone(), entity.clone());
                    }
                    None => {
                        base.entities.remove(id);
                    }
                }
            }
        }
        base
    };
    base.history = history.to_owned();
    let latest = remote.pull(Some(&base)).await?;
    if latest.history != history {
        return Err(
            "Cloud history changed during synchronization; cached data is preserved.".into(),
        );
    }
    let mut next = workspace.clone();
    next.authoritative = Some(latest);
    next.history_fingerprint = Some(history_fingerprint(history));
    checkpoint(workspace, next, &mut persist)?;
    while let Some(pending) = workspace.pending.first().cloned() {
        let authoritative = workspace
            .authoritative
            .as_ref()
            .ok_or("Missing authoritative state")?
            .clone();
        if postcondition_met(&pending, &authoritative) {
            let mut next = workspace.clone();
            next.pending.remove(0);
            checkpoint(workspace, next, &mut persist)?;
            continue;
        }
        if pending.status != "queued" || store::conflicts(&pending, &authoritative.entities) {
            let mut next = workspace.clone();
            next.pending[0].status =
                if pending.status == "sending" || pending.status == "uncertain" {
                    "uncertain"
                } else {
                    "review"
                }
                .into();
            checkpoint(workspace, next, &mut persist)?;
            return Err("A saved edit needs review. Its original draft is preserved and was not sent again. Open Settings → Things Cloud → Sync recovery.".into());
        }
        let mut sending = workspace.clone();
        sending.pending[0].status = "sending".into();
        checkpoint(workspace, sending, &mut persist)?;
        match remote.commit(&authoritative, pending.changes).await {
            Ok(committed) => {
                if committed.history != history || committed.head < authoritative.head {
                    let mut next = workspace.clone();
                    next.pending[0].status = "uncertain".into();
                    checkpoint(workspace, next, &mut persist)?;
                    return Err("The commit response had an inconsistent history. No request will be resent automatically.".into());
                }
                let mut next = workspace.clone();
                next.authoritative = Some(committed);
                next.pending.remove(0);
                checkpoint(workspace, next, &mut persist)?;
            }
            Err(failure) => {
                let mut next = workspace.clone();
                next.pending[0].status = match failure.disposition {
                    CommitDisposition::Retryable => "queued",
                    CommitDisposition::Review => "review",
                    CommitDisposition::Uncertain => "uncertain",
                }
                .into();
                checkpoint(workspace, next, &mut persist)?;
                return Err(failure.message);
            }
        }
    }
    let mut next = workspace.clone();
    next.last_sync = Some(chrono::Utc::now().to_rfc3339());
    checkpoint(workspace, next, &mut persist)
}

/// Apply an IPC mutation, preserving a before-image for conflict detection and durable offline edits.
pub(crate) fn mutate(
    workspace: &Workspace,
    changes: Value,
    confirm: bool,
    cloud_account: bool,
) -> Result<Workspace, String> {
    let mut changes = store::prepare(changes)?;
    crate::recurrence::normalize_creation(&workspace.snapshot.entities, &mut changes)?;
    for (id, event) in changes.as_object_mut().ok_or("Invalid changes")? {
        let old = workspace.snapshot.entities.get(id);
        let p = event["p"].as_object().ok_or("Invalid fields")?;
        let stops_series = old.is_some_and(|e| {
            (e.props.get("rr").is_some_and(|v| !v.is_null())
                && (p.get("rr") == Some(&Value::Null)
                    || p.get("tr") == Some(&Value::Bool(true))
                    || p.get("icp") == Some(&Value::Bool(true))))
                || (e.props["rt"].as_array().is_some_and(|a| !a.is_empty())
                    && p.get("rt")
                        .and_then(Value::as_array)
                        .is_some_and(Vec::is_empty))
        });
        if !confirm && (event["t"].as_u64() == Some(2) || stops_series) {
            return Err(
                "Confirm permanent deletion or stopping this repeating series before saving."
                    .into(),
            );
        }
        if let Some(text) = event["p"]["nt"].as_str() {
            event["p"]["nt"] = store::note(text);
        }
        event["p"]["md"] = serde_json::json!(chrono::Utc::now().timestamp_millis() as f64 / 1000.);
    }
    store::validate(&workspace.snapshot.entities, &changes)?;
    let mut next = workspace.clone();
    let base = changes
        .as_object()
        .unwrap()
        .keys()
        .map(|id| (id.clone(), next.snapshot.entities.get(id).cloned()))
        .collect();
    store::apply(&mut next.snapshot.entities, &changes)?;
    if cloud_account {
        next.pending.push(Pending {
            changes,
            base,
            status: "queued".into(),
        });
    }
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::VecDeque;
    const HISTORY: &str = "synthetic-history";
    struct FakeRemote {
        pulls: VecDeque<Result<Snapshot, String>>,
        outcomes: VecDeque<Result<(), CommitError>>,
        commit_calls: usize,
    }
    impl FakeRemote {
        fn new(pulls: Vec<Snapshot>, outcomes: Vec<Result<(), CommitError>>) -> Self {
            Self {
                pulls: pulls.into_iter().map(Ok).collect(),
                outcomes: outcomes.into(),
                commit_calls: 0,
            }
        }
    }
    impl Remote for FakeRemote {
        async fn pull(&mut self, _: Option<&Snapshot>) -> Result<Snapshot, String> {
            self.pulls.pop_front().expect("unexpected pull")
        }
        async fn commit(
            &mut self,
            current: &Snapshot,
            changes: Value,
        ) -> Result<Snapshot, CommitError> {
            self.commit_calls += 1;
            self.outcomes.pop_front().expect("unexpected commit")?;
            let mut next = current.clone();
            cloud::apply_batch(&mut next, &changes).unwrap();
            next.head += 1;
            Ok(next)
        }
    }
    fn fixture() -> (Workspace, String) {
        let id = store::id();
        let initial=mutate(&Workspace::default(),json!({id.clone():{"e":"Task6","t":0,"p":{"tt":"Original","tp":0,"st":0,"ss":0,"tr":false,"ix":1790000000000i64,"cd":1790000000.25}}}),false,false).unwrap();
        let mut snapshot = initial.snapshot;
        snapshot.history = HISTORY.into();
        let workspace = attach(&Workspace::default(), snapshot).unwrap();
        (workspace, id)
    }
    fn edit(w: &Workspace, id: &str, title: &str) -> Workspace {
        mutate(
            w,
            json!({id:{"e":"Task6","t":1,"p":{"tt":title}}}),
            false,
            true,
        )
        .unwrap()
    }
    #[test]
    fn frontend_minimal_create_gets_valid_complete_native_payload() {
        let (w, id) = fixture();
        let task = &w.snapshot.entities[&id];
        assert_eq!(task.props["tr"], false);
        assert_eq!(task.props["nt"], store::note(""));
        assert!(task.props.get("dds").unwrap().is_null());
        assert!(task.props["cd"].is_number());
    }
    #[tokio::test]
    async fn offline_before_post_preserves_retryable_draft_and_original_base() {
        let (w, id) = fixture();
        let mut workspace = edit(&w, &id, "Draft");
        let original = workspace.pending[0].base.clone();
        let mut remote = FakeRemote::new(
            vec![w.snapshot.clone()],
            vec![Err(CommitError::new(
                CommitDisposition::Retryable,
                "offline before POST",
            ))],
        );
        let mut checkpoints = Vec::new();
        assert!(sync(&mut remote, HISTORY, &mut workspace, |w| {
            checkpoints.push(w.clone());
            Ok(())
        })
        .await
        .is_err());
        assert_eq!(workspace.pending[0].status, "queued");
        assert_eq!(workspace.pending[0].base, original);
        assert!(checkpoints
            .iter()
            .any(|w| w.pending.first().is_some_and(|p| p.status == "sending")));
        let mut retry = FakeRemote::new(vec![w.snapshot.clone()], vec![Ok(())]);
        sync(&mut retry, HISTORY, &mut workspace, |_| Ok(()))
            .await
            .unwrap();
        assert!(workspace.pending.is_empty());
        assert_eq!(
            workspace.authoritative.unwrap().entities[&id].props["tt"],
            "Draft"
        );
    }
    #[tokio::test]
    async fn initial_pull_failure_does_not_block_or_modify_drafts() {
        let (w, id) = fixture();
        let mut workspace = edit(&w, &id, "Draft");
        let before = serde_json::to_value(&workspace).unwrap();
        let mut remote = FakeRemote {
            pulls: vec![Err("offline".into())].into(),
            outcomes: VecDeque::new(),
            commit_calls: 0,
        };
        let mut saves = 0;
        assert!(sync(&mut remote, HISTORY, &mut workspace, |_| {
            saves += 1;
            Ok(())
        })
        .await
        .is_err());
        assert_eq!(saves, 0);
        assert_eq!(remote.commit_calls, 0);
        assert_eq!(serde_json::to_value(&workspace).unwrap(), before);
    }
    #[tokio::test]
    async fn uncertain_and_crash_sending_drafts_are_never_resent() {
        let (w, id) = fixture();
        let mut workspace = edit(&w, &id, "Draft");
        let mut remote = FakeRemote::new(
            vec![w.snapshot.clone()],
            vec![Err(CommitError::new(
                CommitDisposition::Uncertain,
                "uncertain outcome",
            ))],
        );
        assert!(sync(&mut remote, HISTORY, &mut workspace, |_| Ok(()))
            .await
            .is_err());
        assert_eq!(workspace.pending[0].status, "uncertain");
        for status in ["uncertain", "sending"] {
            workspace.pending[0].status = status.into();
            let encoded = serde_json::to_string(&workspace).unwrap();
            let mut restarted: Workspace = serde_json::from_str(&encoded).unwrap();
            let mut retry = FakeRemote::new(vec![w.snapshot.clone()], vec![]);
            assert!(sync(&mut retry, HISTORY, &mut restarted, |_| Ok(()))
                .await
                .is_err());
            assert_eq!(retry.commit_calls, 0);
            assert_eq!(restarted.pending[0].status, "uncertain");
        }
    }
    #[tokio::test]
    async fn confirmed_remote_state_reconciles_crash_after_post_without_resending() {
        let (w, id) = fixture();
        let mut workspace = edit(&w, &id, "Draft");
        let changes = workspace.pending[0].changes.clone();
        let mut remote = FakeRemote::new(vec![w.snapshot.clone()], vec![Ok(())]);
        assert!(sync(&mut remote, HISTORY, &mut workspace, |w| {
            if w.pending.is_empty() {
                Err("disk full after POST".into())
            } else {
                Ok(())
            }
        })
        .await
        .is_err());
        assert_eq!(workspace.pending[0].status, "sending");
        let mut actual = w.snapshot.clone();
        cloud::apply_batch(&mut actual, &changes).unwrap();
        actual.head += 1;
        let mut restarted = FakeRemote::new(vec![actual], vec![]);
        sync(&mut restarted, HISTORY, &mut workspace, |_| Ok(()))
            .await
            .unwrap();
        assert!(workspace.pending.is_empty());
        assert_eq!(restarted.commit_calls, 0);
    }
    #[tokio::test]
    async fn persistence_failure_before_post_never_sends() {
        let (w, id) = fixture();
        let mut workspace = edit(&w, &id, "Draft");
        let mut remote = FakeRemote::new(vec![w.snapshot.clone()], vec![]);
        assert!(sync(&mut remote, HISTORY, &mut workspace, |w| {
            if w.pending[0].status == "sending" {
                Err("disk full".into())
            } else {
                Ok(())
            }
        })
        .await
        .is_err());
        assert_eq!(remote.commit_calls, 0);
        assert_eq!(workspace.pending[0].status, "queued");
    }
    #[tokio::test]
    async fn repeated_conflict_review_never_discards_unrelated_remote_fields() {
        let (w, id) = fixture();
        let mut workspace = edit(&w, &id, "Draft");
        let original = workspace.pending[0].base.clone();
        let mut actual = w.snapshot.clone();
        actual.entities.get_mut(&id).unwrap().props["tt"] = json!("Remote title");
        actual.entities.get_mut(&id).unwrap().props["nt"] = store::note("New remote note");
        actual.head = 7;
        for _ in 0..2 {
            let mut remote = FakeRemote::new(vec![actual.clone()], vec![]);
            assert!(sync(&mut remote, HISTORY, &mut workspace, |_| Ok(()))
                .await
                .is_err());
            assert_eq!(remote.commit_calls, 0);
            assert_eq!(workspace.pending[0].base, original);
            assert_eq!(
                workspace.authoritative.as_ref().unwrap().entities[&id].props["nt"],
                store::note("New remote note")
            );
            assert_eq!(
                workspace.snapshot.entities[&id].props["nt"],
                store::note("New remote note")
            );
            assert_eq!(workspace.snapshot.entities[&id].props["tt"], "Draft");
        }
    }
    #[tokio::test]
    async fn ordered_drafts_commit_and_checkpoint_individually() {
        let (w, id) = fixture();
        let first = edit(&w, &id, "First");
        let mut workspace = edit(&first, &id, "Second");
        let mut remote = FakeRemote::new(vec![w.snapshot.clone()], vec![Ok(()), Ok(())]);
        let mut remaining = Vec::new();
        sync(&mut remote, HISTORY, &mut workspace, |w| {
            remaining.push(w.pending.len());
            Ok(())
        })
        .await
        .unwrap();
        assert_eq!(remote.commit_calls, 2);
        assert!(remaining.contains(&1));
        assert!(workspace.pending.is_empty());
        assert_eq!(workspace.snapshot.entities[&id].props["tt"], "Second");
    }
    #[test]
    fn recovery_does_not_discard_edits_saved_during_the_cloud_pull() {
        let (base, id) = fixture();
        let first = edit(&base, &id, "Existing draft");
        let concurrent = edit(&first, &id, "New draft during recovery");
        assert!(recover(&concurrent, base.snapshot.clone(), first.pending.len()).is_err());
        assert_eq!(
            concurrent.snapshot.entities[&id].props["tt"],
            "New draft during recovery"
        );
        let restored = recover(&concurrent, base.snapshot, concurrent.pending.len()).unwrap();
        assert!(restored.pending.is_empty());
        assert_eq!(restored.snapshot.entities[&id].props["tt"], "Original");
    }
    #[test]
    fn reconnect_preserves_original_drafts_and_rejects_changed_history() {
        let (w, id) = fixture();
        let workspace = edit(&w, &id, "Draft");
        let original = workspace.pending[0].base.clone();
        let encoded = serde_json::to_string(&workspace).unwrap();
        assert!(!encoded.contains(HISTORY));
        let disconnected: Workspace = serde_json::from_str(&encoded).unwrap();
        let mut actual = w.snapshot.clone();
        actual.entities.get_mut(&id).unwrap().props["nt"] = store::note("Remote note");
        let connected = attach(&disconnected, actual.clone()).unwrap();
        assert_eq!(connected.pending[0].base, original);
        assert_eq!(connected.snapshot.entities[&id].props["tt"], "Draft");
        assert_eq!(
            connected.snapshot.entities[&id].props["nt"],
            store::note("Remote note")
        );
        actual.history = "new-history".into();
        assert!(attach(&disconnected, actual).is_err());
    }
    #[test]
    fn complete_recurring_copy_does_not_fabricate_new_instances_and_stop_is_confirmed() {
        let (w, id) = fixture();
        let template = store::id();
        let first = 1792713600i64;
        let changes = json!({template.clone():{"e":"Task6","t":0,"p":{"tt":"Repeat","rr":{"rrv":4,"tp":0,"rc":0,"ts":0,"fu":16,"fa":1,"of":[{}],"ia":first,"ed":64092211200i64},"sr":first,"tir":first}},id.clone():{"e":"Task6","t":1,"p":{"rt":[template],"sr":first,"tir":first}}});
        let repeating = mutate(&w, changes, false, false).unwrap();
        assert_eq!(
            repeating.snapshot.entities[&template].props["sr"],
            first + 86400
        );
        let complete = mutate(
            &repeating,
            json!({id.clone():{"e":"Task6","t":1,"p":{"ss":3,"sp":1792713700.0}}}),
            false,
            false,
        )
        .unwrap();
        assert_eq!(complete.snapshot.entities.len(), 2);
        let stop = json!({template.clone():{"e":"Task6","t":1,"p":{"tr":true}},id.clone():{"e":"Task6","t":1,"p":{"rt":[],"rr":null,"icsd":null}}});
        assert!(mutate(&repeating, stop.clone(), false, false).is_err());
        let stopped = mutate(&repeating, stop, true, false).unwrap();
        assert_eq!(stopped.snapshot.entities[&template].props["tr"], true);
        assert!(stopped.snapshot.entities[&id].props["rt"]
            .as_array()
            .unwrap()
            .is_empty());
    }
}

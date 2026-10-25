//! Things Cloud transport and atomic event replay. Protocol evidence: docs/cloud-protocol.md.
//! Never log a reqwest error directly: request URLs contain the private history capability.
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{Client, Method, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha1::{Digest, Sha1};
use std::{
    collections::{BTreeMap, BTreeSet},
    time::{Duration, Instant},
};

const ENDPOINT: &str = "https://cloud.culturedcode.com";
const MAX_BODY: usize = 64 * 1024 * 1024;
const MAX_PAGES: usize = 10_000;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Entity {
    pub id: String,
    pub kind: String,
    pub props: Value,
}
#[derive(Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Snapshot {
    pub entities: BTreeMap<String, Entity>,
    pub head: u64,
    // This capability belongs in Keychain. Never expose it through IPC/JSON/debug output.
    #[serde(skip)]
    pub history: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum CommitDisposition {
    Retryable,
    Review,
    Uncertain,
}
#[derive(Clone, Debug)]
pub(crate) struct CommitError {
    pub disposition: CommitDisposition,
    pub message: String,
}
impl CommitError {
    pub(crate) fn new(disposition: CommitDisposition, message: impl Into<String>) -> Self {
        Self {
            disposition,
            message: message.into(),
        }
    }
}

pub fn new_id() -> String {
    bs58::encode(uuid::Uuid::new_v4().as_bytes()).into_string()
}
pub fn note(text: &str) -> Value {
    json!({"_t":"tx","t":1,"ch":crc32fast::hash(text.as_bytes()),"v":text})
}
fn canonical_id(id: &str) -> bool {
    bs58::decode(id)
        .into_vec()
        .map(|v| v.len() == 16 && bs58::encode(v).into_string() == id)
        .unwrap_or(false)
}
fn legacy_id(id: &str) -> String {
    if canonical_id(id) || id.is_empty() {
        return id.to_owned();
    }
    let bytes = id.as_bytes();
    let input = if bytes.len() == 45
        && bytes[36] == b'-'
        && bytes[37..].iter().all(u8::is_ascii_digit)
        && std::str::from_utf8(&bytes[..36])
            .ok()
            .and_then(|s| uuid::Uuid::parse_str(s).ok())
            .is_some()
    {
        let mut v = Sha1::digest(&bytes[..36])[..16].to_vec();
        v.extend_from_slice(&bytes[36..]);
        v
    } else {
        bytes.to_vec()
    };
    bs58::encode(&Sha1::digest(input)[..16]).into_string()
}
fn kind_family(kind: &str) -> Option<(&'static str, bool)> {
    match kind {
        "Task6" => Some(("Task6", false)),
        "Task7" => Some(("Task7", false)),
        "Contact2" => Some(("Contact2", false)),
        "Contact" => Some(("Contact2", true)),
        "Command3" => Some(("Command3", false)),
        "Command" | "Command2" => Some(("Command3", true)),
        "SmartList" => Some(("SmartList", false)),
        "Task" | "Task3" | "Task4" => Some(("Task6", true)),
        "Area3" => Some(("Area3", false)),
        "Area" | "Area2" => Some(("Area3", true)),
        "Tag4" => Some(("Tag4", false)),
        "Tag" | "Tag3" => Some(("Tag4", true)),
        "ChecklistItem3" => Some(("ChecklistItem3", false)),
        "ChecklistItem" | "ChecklistItem2" => Some(("ChecklistItem3", true)),
        "Tombstone2" => Some(("Tombstone2", false)),
        "Tombstone" => Some(("Tombstone2", true)),
        _ => None,
    }
}
fn settings(kind: &str) -> bool {
    kind.strip_prefix("Settings")
        .map(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
        .unwrap_or(false)
}
fn err(message: &str) -> String {
    format!("Things Cloud: {message}")
}

/// Validate known field types, retaining unknown fields verbatim for future-safe replay.
fn validate_props(props: &Map<String, Value>) -> Result<(), String> {
    for (key, value) in props {
        if value.is_null() {
            continue;
        }
        let valid = match key.as_str() {
            "tt" | "sh" | "rp" | "dloid" => value.is_string(),
            "tr" | "icp" | "lt" => value.is_boolean(),
            "ix" | "ti" | "do" | "icc" | "ato" => value.as_i64().is_some(),
            "tp" => value.as_u64().is_some_and(|v| v <= 2),
            "ss" => value.as_u64().is_some_and(|v| [0, 2, 3].contains(&v)),
            "st" => value.as_u64().is_some_and(|v| v <= 2),
            "sb" => value.as_u64().is_some_and(|v| v <= 1),
            "cd" | "md" | "sp" | "sr" | "tir" | "dd" | "icsd" | "rmd" | "dds" | "acrd" | "lai"
            | "dld" => value.is_number(),
            "ar" | "pr" | "agr" | "tg" | "rt" | "dl" | "ts" | "pn" => value
                .as_array()
                .is_some_and(|a| a.iter().all(Value::is_string)),
            "rr" | "xx" => value.is_object(),
            "nt" => value.is_object() || value.is_string(),
            _ => true,
        };
        if !valid {
            return Err(err(&format!(
                "invalid field type for {key}; sync stopped without changing saved data"
            )));
        }
    }
    Ok(())
}
fn note_text(value: Option<&Value>) -> String {
    value
        .and_then(|v| v.as_str().or_else(|| v.get("v").and_then(Value::as_str)))
        .unwrap_or("")
        .to_owned()
}
fn unsupported_note(value: &Value) -> String {
    fn shape(v: Option<&Value>) -> &'static str {
        match v {
            None => "absent",
            Some(Value::Null) => "null",
            Some(Value::String(_)) => "text",
            Some(Value::Array(_)) => "array",
            Some(Value::Object(_)) => "object",
            Some(Value::Number(_)) => "number",
            Some(Value::Bool(_)) => "boolean",
        }
    }
    let kind = value
        .get("t")
        .and_then(Value::as_i64)
        .map(|v| v.to_string())
        .unwrap_or_else(|| shape(value.get("t")).into());
    err(&format!(
        "unsupported note format (type {kind}, value {}, patches {}); saved data preserved",
        shape(value.get("v")),
        shape(value.get("ps"))
    ))
}
fn apply_note(old: Option<&Value>, incoming: &Value) -> Result<Value, String> {
    if incoming.is_null() {
        return Ok(Value::Null);
    }
    if let Some(s) = incoming.as_str() {
        return Ok(note(s));
    }
    match incoming.get("t").and_then(Value::as_u64) {
        Some(0) if incoming.get("v").is_none() && incoming.get("ps").is_none() => {
            // Type zero carries no text operation. The reference reducer retains
            // the prior note; treating it as an empty replacement would erase it.
            Ok(old.cloned().unwrap_or_else(|| note("")))
        }
        Some(1) => match incoming.get("v") {
            Some(Value::String(text)) => Ok(note(text)),
            None => Ok(note("")), // Omitted empty strings are valid in compact history records.
            _ => Err(err("malformed full-text note")),
        },
        None | Some(0) if incoming.get("ps").is_none() => {
            // The reference sync reducer also accepts a complete value without a
            // recognized type discriminator. Do not treat patch records as full text.
            if let Some(text) = incoming.get("v").and_then(Value::as_str) {
                Ok(note(text))
            } else if incoming.get("_t").and_then(Value::as_str) == Some("tx")
                && incoming.get("ch").and_then(Value::as_u64) == Some(0)
                && incoming.get("v").is_none()
            {
                Ok(note(""))
            } else {
                Err(unsupported_note(incoming))
            }
        }
        Some(2) => {
            let patches = incoming
                .get("ps")
                .and_then(Value::as_array)
                .ok_or_else(|| err("malformed note patches"))?;
            let mut chars: Vec<char> = note_text(old).chars().collect();
            for patch in patches {
                let p = patch
                    .get("p")
                    .and_then(Value::as_i64)
                    .ok_or_else(|| err("malformed note patch position"))?;
                let l = patch
                    .get("l")
                    .and_then(Value::as_u64)
                    .ok_or_else(|| err("malformed note patch length"))?;
                let r = patch
                    .get("r")
                    .and_then(Value::as_str)
                    .ok_or_else(|| err("malformed note replacement"))?;
                let start = (p.max(0) as usize).min(chars.len());
                let end = start
                    .saturating_add(usize::try_from(l).unwrap_or(usize::MAX))
                    .min(chars.len());
                chars.splice(start..end, r.chars());
            }
            Ok(note(&chars.into_iter().collect::<String>()))
        }
        _ if incoming.get("ps").is_none() && incoming.get("v").is_some_and(Value::is_string) => {
            // Sync reducer compatibility: a standalone value is a full replacement,
            // including historical discriminator values outside the current 1/2 pair.
            Ok(note(incoming["v"].as_str().unwrap()))
        }
        _ => Err(unsupported_note(incoming)),
    }
}

/// Replay one complete commit into an isolated candidate. Callers persist only a successful candidate.
pub(crate) fn apply_batch(snapshot: &mut Snapshot, changes: &Value) -> Result<(), String> {
    let batch = changes
        .as_object()
        .ok_or_else(|| err("history commit must be an object"))?;
    for (raw_id, event) in batch {
        let kind = event
            .get("e")
            .and_then(Value::as_str)
            .ok_or_else(|| err("missing entity kind"))?;
        if settings(kind) {
            continue;
        }
        let (family, legacy) = kind_family(kind).ok_or_else(|| {
            let label = if kind.len() <= 48 && kind.bytes().all(|b| b.is_ascii_alphanumeric()) {
                kind
            } else {
                "unrecognized"
            };
            err(&format!(
                "unsupported entity kind {label}; saved data preserved"
            ))
        })?;
        let action = event
            .get("t")
            .and_then(Value::as_u64)
            .filter(|a| *a <= 2)
            .ok_or_else(|| err("unsupported entity action"))?;
        let mut props = event
            .get("p")
            .and_then(Value::as_object)
            .cloned()
            .ok_or_else(|| err("malformed entity payload"))?;
        let task_graph = !matches!(family, "Contact2" | "Command3" | "SmartList");
        if task_graph {
            validate_props(&props)?;
        }
        let id = if legacy {
            legacy_id(raw_id)
        } else {
            raw_id.clone()
        };
        if !canonical_id(&id) {
            return Err(err("invalid entity identifier"));
        }
        if legacy {
            for key in ["ar", "pr", "agr", "tg", "rt", "dl", "ts", "pn"] {
                if let Some(Value::Array(ids)) = props.get_mut(key) {
                    for id in ids {
                        *id = Value::String(legacy_id(id.as_str().unwrap_or("")));
                    }
                }
            }
            if let Some(Value::String(target)) = props.get_mut("dloid") {
                *target = legacy_id(target);
            }
        }
        if family == "Tombstone2" {
            let deleted = props
                .get("dloid")
                .and_then(Value::as_str)
                .filter(|s| canonical_id(s))
                .ok_or_else(|| err("invalid tombstone target"))?;
            snapshot.entities.remove(deleted);
            continue;
        }
        if action == 2 {
            snapshot.entities.remove(&id);
            continue;
        }
        if let Some(existing) = snapshot.entities.get(&id) {
            // History may interleave task schema versions from different clients.
            // Merge older task patches without downgrading the retained wire kind.
            let compatible_task_versions = matches!(existing.kind.as_str(), "Task6" | "Task7")
                && matches!(family, "Task6" | "Task7");
            if existing.kind != family && !compatible_task_versions {
                return Err(err(&format!(
                    "entity changed type unexpectedly ({} → {}); saved data preserved",
                    existing.kind, family
                )));
            }
        }
        let entry = snapshot
            .entities
            .entry(id.clone())
            .or_insert_with(|| Entity {
                id,
                kind: family.to_owned(),
                props: json!({}),
            });
        if family == "Task7" {
            entry.kind = family.to_owned();
        }
        let target = entry
            .props
            .as_object_mut()
            .ok_or_else(|| err("invalid cached entity payload"))?;
        for (key, value) in props {
            if key == "nt" && task_graph {
                let next = apply_note(target.get("nt"), &value)?;
                target.insert(key, next);
            } else {
                target.insert(key, value);
            }
        }
    }
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgress {
    pub stage: &'static str,
    pub received_bytes: u64,
    pub items: u64,
}
type ProgressCallback = Box<dyn Fn(TransferProgress) + Send + Sync>;
struct Cloud {
    progress: Option<ProgressCallback>,
    received_bytes: u64,
    imported_items: u64,
    http: Client,
    endpoint: String,
    interval: Duration,
    last: Option<Instant>,
}
impl Cloud {
    fn new(endpoint: &str, interval: Duration) -> Result<Self, String> {
        let http = Client::builder()
            .connect_timeout(Duration::from_secs(20))
            .read_timeout(Duration::from_secs(90))
            .timeout(Duration::from_secs(300))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| err("could not initialize secure networking"))?;
        Ok(Self {
            progress: None,
            received_bytes: 0,
            imported_items: 0,
            http,
            endpoint: endpoint.trim_end_matches('/').to_owned(),
            interval,
            last: None,
        })
    }
    fn report(&self, stage: &'static str) {
        if let Some(callback) = &self.progress {
            callback(TransferProgress {
                stage,
                received_bytes: self.received_bytes,
                items: self.imported_items,
            });
        }
    }
    async fn request(
        &mut self,
        method: Method,
        path: &str,
        password: Option<&str>,
        body: Option<&Value>,
    ) -> Result<(StatusCode, Value), String> {
        // Reading an immutable history range/account is safe to retry. Never retry a
        // POST here: its outcome must be reconciled by the commit workflow.
        let attempts = if method == Method::GET { 3 } else { 1 };
        for attempt in 0..attempts {
            let result = self
                .request_once(method.clone(), path, password, body)
                .await;
            match &result {
                Err(message)
                    if attempt + 1 < attempts
                        && (message.contains("download interrupted")
                            || message.contains("network request failed")) =>
                {
                    tokio::time::sleep(Duration::from_millis(250 * (attempt + 1) as u64)).await;
                }
                _ => return result,
            }
        }
        unreachable!()
    }
    async fn request_once(
        &mut self,
        method: Method,
        path: &str,
        password: Option<&str>,
        body: Option<&Value>,
    ) -> Result<(StatusCode, Value), String> {
        if let Some(last) = self.last {
            if let Some(delay) = self.interval.checked_sub(last.elapsed()) {
                tokio::time::sleep(delay).await;
            }
        }
        self.last = Some(Instant::now());
        let info = json!({"dm":"MacBookPro18,3","lr":"US","nf":true,"nk":true,"nn":"ThingsMac","nv":"32209501","on":"macOS","ov":"15.7.3","pl":"en-US","ul":"en-Latn-US"});
        let mut req = self
            .http
            .request(method.clone(), format!("{}{path}", self.endpoint))
            .header("User-Agent", "ThingsMac/32209501")
            .header("Accept", "application/json")
            .header("Accept-Charset", "UTF-8")
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("Things-Client-Info", STANDARD.encode(info.to_string()));
        if let Some(password) = password {
            req = req.header("Authorization", format!("Password {password}"));
        }
        if let Some(body) = body {
            req = req
                .header("Content-Type", "application/json; charset=UTF-8")
                .header("Content-Encoding", "UTF-8")
                .header("Schema", "301")
                .header("Push-Priority", "5")
                .header("App-Id", "com.culturedcode.ThingsMac")
                .header(
                    "App-Instance-Id",
                    format!(
                        "{}-com.culturedcode.ThingsMac-{}",
                        "0".repeat(61),
                        "0".repeat(61)
                    ),
                )
                .json(body);
        }
        let mut response = req
            .send()
            .await
            .map_err(|_| err("network request failed; check your connection"))?;
        let status = response.status();
        if !status.is_success() {
            return Ok((status, Value::Null));
        }
        let expected = response.content_length();
        let stage = if path.contains("/account/") {
            "account verification"
        } else {
            "history download"
        };
        let mut bytes = Vec::new();
        let mut last_report = Instant::now();
        while let Some(chunk) = response.chunk().await.map_err(|error| {
            // Error Display/source can contain the secret history URL. Only
            // expose classification and transfer sizes, never request data.
            let reason = if error.is_timeout() {
                "timed out"
            } else if error.is_decode() {
                "invalid transfer encoding"
            } else {
                "connection closed"
            };
            err(&format!(
                "download interrupted during {stage}: {reason} after {} bytes{}; please try again",
                bytes.len(),
                expected.map(|n| format!(" of {n}")).unwrap_or_default()
            ))
        })? {
            if bytes.len().saturating_add(chunk.len()) > MAX_BODY {
                return Err(err("server response exceeds the safe size limit"));
            }
            bytes.extend_from_slice(&chunk);
            if password.is_none() {
                self.received_bytes += chunk.len() as u64;
                if last_report.elapsed() >= Duration::from_millis(200) {
                    self.report("downloading");
                    last_report = Instant::now();
                }
            }
        }
        if password.is_none() {
            self.report("processing");
        }
        let value = serde_json::from_slice(&bytes).map_err(|_| err("invalid server response"))?;
        Ok((status, value))
    }
    async fn verify(&mut self, email: &str, password: &str) -> Result<String, String> {
        if email.trim().is_empty() || password.is_empty() {
            return Err(err("enter your Things Cloud email and password"));
        }
        let mut url = reqwest::Url::parse(&format!("{}/version/1/account/", self.endpoint))
            .map_err(|_| err("invalid cloud endpoint"))?;
        url.path_segments_mut()
            .map_err(|_| err("invalid cloud endpoint"))?
            .pop_if_empty()
            .push(email.trim());
        let (status, value) = self
            .request(Method::GET, url.path(), Some(password), None)
            .await?;
        check_status(status)?;
        if value.get("status").and_then(Value::as_str) != Some("SYAccountStatusActive") {
            return Err(err(
                "account is not active; check Things Cloud account settings",
            ));
        }
        let history = value
            .get("history-key")
            .and_then(Value::as_str)
            .filter(|s| {
                !s.is_empty()
                    && s.len() <= 512
                    && s.bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
            })
            .ok_or_else(|| err("verification returned an invalid history key"))?;
        Ok(history.to_owned())
    }
    async fn pull_history(
        &mut self,
        history: &str,
        previous: Option<&Snapshot>,
    ) -> Result<(Snapshot, Vec<Value>), String> {
        if previous.is_some_and(|p| p.history != history) {
            return Err(err(
                "account history changed; reconnect explicitly to avoid mixing accounts",
            ));
        }
        let mut candidate = previous.cloned().unwrap_or_else(|| Snapshot {
            history: history.to_owned(),
            ..Default::default()
        });
        let mut events = Vec::new();
        for _ in 0..MAX_PAGES {
            let start = candidate.head;
            let (status, page) = self
                .request(
                    Method::GET,
                    &format!("/version/1/history/{history}/items?start-index={start}"),
                    None,
                    None,
                )
                .await?;
            check_status(status)?;
            let schema = page
                .get("schema")
                .and_then(Value::as_u64)
                .filter(|v| *v != 0)
                .or_else(|| page.get("latest-schema-version").and_then(Value::as_u64))
                .ok_or_else(|| err("missing history schema"))?;
            if schema == 0 || schema > 301 {
                return Err(err(
                    "unsupported history schema; update the client before syncing",
                ));
            }
            let head = page
                .get("current-item-index")
                .and_then(Value::as_u64)
                .ok_or_else(|| err("missing history cursor"))?;
            let commits = page
                .get("items")
                .and_then(Value::as_array)
                .ok_or_else(|| err("missing history items"))?;
            let loaded = start
                .checked_add(commits.len() as u64)
                .ok_or_else(|| err("history cursor overflow"))?;
            if head < start || (schema == 301 && loaded > head) {
                return Err(err("history cursor regressed or is inconsistent"));
            }
            if commits.is_empty() && start < head {
                return Err(err("history pagination made no progress"));
            }
            for batch in commits {
                apply_batch(&mut candidate, batch)?;
                events.push(batch.clone());
            }
            candidate.head = loaded;
            self.imported_items = candidate.entities.len() as u64;
            self.report("processing");
            if loaded >= head {
                return Ok((candidate, events));
            }
        }
        Err(err("history exceeded the page limit; saved data preserved"))
    }
    async fn pull(
        &mut self,
        email: &str,
        password: &str,
        previous: Option<&Snapshot>,
    ) -> Result<Snapshot, String> {
        self.report("verifying");
        let history = self.verify(email, password).await?;
        self.report("downloading");
        Ok(self.pull_history(&history, previous).await?.0)
    }
    async fn commit_classified(
        &mut self,
        email: &str,
        password: &str,
        snapshot: &Snapshot,
        changes: Value,
    ) -> Result<Snapshot, CommitError> {
        let current = self
            .pull(email, password, Some(snapshot))
            .await
            .map_err(|e| CommitError::new(CommitDisposition::Retryable, e))?;
        // If the same properties changed remotely since editing began, preserve the draft and stop.
        check_conflicts(snapshot, &current, &changes)
            .map_err(|e| CommitError::new(CommitDisposition::Review, e))?;
        let mut candidate = validate_write(&current, &changes)
            .map_err(|e| CommitError::new(CommitDisposition::Review, e))?;
        let next = current.head.checked_add(1).ok_or_else(|| {
            CommitError::new(CommitDisposition::Review, err("history cursor overflow"))
        })?;
        let outcome = self
            .request(
                Method::POST,
                &format!(
                    "/version/1/history/{}/commit?ancestor-index={}&_cnt=1",
                    current.history, current.head
                ),
                None,
                Some(&changes),
            )
            .await;
        match outcome {
            Ok((StatusCode::OK, value))
                if value.get("server-head-index").and_then(Value::as_u64) == Some(next) =>
            {
                candidate.head = next;
                Ok(candidate)
            }
            Ok((status, _)) if status.is_client_error() => {
                let disposition = if matches!(
                    status,
                    StatusCode::UNAUTHORIZED
                        | StatusCode::FORBIDDEN
                        | StatusCode::TOO_MANY_REQUESTS
                        | StatusCode::CONFLICT
                ) {
                    CommitDisposition::Retryable
                } else {
                    CommitDisposition::Review
                };
                Err(CommitError::new(
                    disposition,
                    check_status(status).unwrap_err(),
                ))
            }
            _ => {
                // Never repeat the POST, even when the server returned malformed data or timed out.
                if let Ok((reconciled, events)) =
                    self.pull_history(&current.history, Some(&current)).await
                {
                    if contains_commit(&events, &changes) {
                        return Ok(reconciled);
                    }
                }
                Err(CommitError::new(CommitDisposition::Uncertain,err("UNCERTAIN_COMMIT: the server may have saved this change. Sync to reconcile before retrying; this request was not sent again")))
            }
        }
    }
    #[cfg(test)]
    async fn commit(
        &mut self,
        email: &str,
        password: &str,
        snapshot: &Snapshot,
        changes: Value,
    ) -> Result<Snapshot, String> {
        self.commit_classified(email, password, snapshot, changes)
            .await
            .map_err(|e| e.message)
    }
}
fn check_status(status: StatusCode) -> Result<(), String> {
    match status {
        StatusCode::OK => Ok(()),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(err(
            "authentication was rejected; reconnect with your Things Cloud password",
        )),
        StatusCode::TOO_MANY_REQUESTS => Err(err("rate limited; wait before trying again")),
        StatusCode::CONFLICT => Err(err(
            "history changed during save; sync and review your edit before retrying",
        )),
        _ => Err(err(&format!(
            "server returned HTTP {}; saved data is preserved",
            status.as_u16()
        ))),
    }
}
fn contains_commit(events: &[Value], changes: &Value) -> bool {
    let Some(expected) = changes.as_object() else {
        return false;
    };
    // One original atomic commit must contain all exact payloads, not just matching IDs.
    events.iter().any(|batch| {
        batch.as_object().is_some_and(|map| {
            expected
                .iter()
                .all(|(id, event)| map.get(id) == Some(event))
        })
    })
}
fn check_conflicts(before: &Snapshot, current: &Snapshot, changes: &Value) -> Result<(), String> {
    let changes = changes
        .as_object()
        .ok_or_else(|| err("changes must be an object"))?;
    for (id, event) in changes {
        let action = event.get("t").and_then(Value::as_u64);
        if action == Some(0) {
            continue;
        }
        let old = before
            .entities
            .get(id)
            .ok_or_else(|| err("edited item no longer exists"))?;
        let new = current
            .entities
            .get(id)
            .ok_or_else(|| err("item was deleted on another device; draft retained"))?;
        if action == Some(2) && old != new {
            return Err(err(
                "item changed on another device; review before deleting",
            ));
        }
        if let Some(props) = event.get("p").and_then(Value::as_object) {
            for key in props.keys().filter(|k| k.as_str() != "md") {
                if old.props.get(key) != new.props.get(key) {
                    return Err(err(
                        "this field changed on another device; sync and review your draft",
                    ));
                }
            }
        }
    }
    Ok(())
}
fn ids<'a>(e: &'a Entity, key: &str) -> impl Iterator<Item = &'a str> {
    e.props
        .get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
}
fn active_ancestors(snapshot: &Snapshot, id: &str, seen: &mut BTreeSet<String>) -> bool {
    if !seen.insert(id.to_owned()) {
        return false;
    }
    let Some(entity) = snapshot.entities.get(id) else {
        return false;
    };
    if entity
        .props
        .get("tr")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || entity.props.get("ss").and_then(Value::as_i64).unwrap_or(0) != 0
    {
        return false;
    }
    for parent in ids(entity, "pr").chain(ids(entity, "agr")) {
        if !active_ancestors(snapshot, parent, seen) {
            return false;
        }
    }
    seen.remove(id);
    true
}
/// Validate a complete proposed batch against fresh remote state before POST.
pub(crate) fn validate_write(current: &Snapshot, changes: &Value) -> Result<Snapshot, String> {
    let map = changes
        .as_object()
        .filter(|v| !v.is_empty())
        .ok_or_else(|| err("empty or invalid commit"))?;
    for (id, event) in map {
        if !canonical_id(id) {
            return Err(err("invalid write identifier"));
        }
        let kind = event
            .get("e")
            .and_then(Value::as_str)
            .ok_or_else(|| err("missing write kind"))?;
        if !matches!(
            kind,
            "Task6" | "Task7" | "Area3" | "Tag4" | "ChecklistItem3"
        ) {
            return Err(err("unsupported write entity"));
        }
        let action = event
            .get("t")
            .and_then(Value::as_u64)
            .filter(|v| *v <= 2)
            .ok_or_else(|| err("invalid write action"))?;
        let props = event
            .get("p")
            .and_then(Value::as_object)
            .ok_or_else(|| err("invalid write payload"))?;
        validate_props(props)?;
        for (key, value) in props {
            if !matches!(
                key.as_str(),
                "tt" | "nt"
                    | "ss"
                    | "st"
                    | "tp"
                    | "sr"
                    | "tir"
                    | "dd"
                    | "sp"
                    | "ix"
                    | "ti"
                    | "sb"
                    | "tr"
                    | "ar"
                    | "pr"
                    | "agr"
                    | "tg"
                    | "ts"
                    | "cd"
                    | "md"
                    | "sh"
                    | "pn"
                    | "rr"
                    | "rt"
                    | "icsd"
                    | "icp"
                    | "dds"
                    | "rmd"
                    | "dl"
                    | "do"
                    | "lai"
                    | "lt"
                    | "icc"
                    | "ato"
                    | "rp"
                    | "acrd"
                    | "xx"
            ) {
                return Err(err("unsupported write field; original data preserved"));
            }
            if value.is_null()
                && matches!(
                    key.as_str(),
                    "tt" | "ss"
                        | "st"
                        | "tp"
                        | "ix"
                        | "ti"
                        | "sb"
                        | "tr"
                        | "ar"
                        | "pr"
                        | "agr"
                        | "tg"
                        | "ts"
                        | "pn"
                        | "rt"
                        | "icp"
                        | "dl"
                        | "lt"
                        | "icc"
                        | "do"
                )
            {
                return Err(err("required fields cannot be cleared with null"));
            }
        }
        if let Some(title) = props.get("tt").and_then(Value::as_str) {
            if title.trim().is_empty() || title.len() > 10000 {
                return Err(err("provide a title between 1 and 10000 bytes"));
            }
        }
        if action == 0 && current.entities.contains_key(id) {
            return Err(err("new item ID already exists"));
        }
        if action != 0 && !current.entities.contains_key(id) {
            return Err(err("item no longer exists"));
        }
        if let Some(existing) = current.entities.get(id) {
            if existing.kind != kind {
                return Err(err("write kind does not match the item"));
            }
        }
        if action == 0
            && props
                .get("tt")
                .and_then(Value::as_str)
                .is_none_or(|s| s.trim().is_empty())
        {
            return Err(err("new items require a title"));
        }
        for key in ["sr", "tir", "dd", "icsd"] {
            if let Some(v) = props.get(key).filter(|v| !v.is_null()) {
                let n = v
                    .as_i64()
                    .ok_or_else(|| err("date must be a UTC calendar-day timestamp"))?;
                if n % 86400 != 0 || !(-62135596800..=64092211200).contains(&n) {
                    return Err(err("invalid calendar date"));
                }
            }
        }
        if let Some(n) = props.get("nt").filter(|n| !n.is_null()) {
            let text = n
                .get("v")
                .and_then(Value::as_str)
                .ok_or_else(|| err("write notes must contain full text"))?;
            if n.get("t").and_then(Value::as_u64) != Some(1)
                || n.get("_t").and_then(Value::as_str) != Some("tx")
                || n.get("ch").and_then(Value::as_u64)
                    != Some(crc32fast::hash(text.as_bytes()) as u64)
            {
                return Err(err("invalid note checksum"));
            }
        }
        if let Some(rr) = props.get("rr").filter(|v| !v.is_null()) {
            validate_recurrence(rr)?;
        }
    }
    let mut candidate = current.clone();
    apply_batch(&mut candidate, changes)?;
    for (id, event) in map {
        if event.get("t").and_then(Value::as_u64) == Some(2) {
            continue;
        }
        let e = &candidate.entities[id];
        let patch = event["p"].as_object().unwrap();
        for (field, kind, task_type) in [
            ("ar", "Area3", None),
            ("pr", "Task6", Some(1)),
            ("agr", "Task6", Some(2)),
            ("tg", "Tag4", None),
            ("rt", "Task6", None),
            ("ts", "Task6", Some(0)),
            ("pn", "Tag4", None),
        ] {
            if !patch.contains_key(field) {
                continue;
            }
            for target in ids(e, field) {
                if target == id {
                    return Err(err("an item cannot contain itself"));
                }
                let dest = candidate
                    .entities
                    .get(target)
                    .ok_or_else(|| err("destination item no longer exists"))?;
                if (dest.kind != kind && !(kind == "Task6" && dest.kind == "Task7"))
                    || task_type.is_some_and(|tp| {
                        dest.props.get("tp").and_then(Value::as_i64).unwrap_or(0) != tp
                    })
                {
                    return Err(err("invalid destination type"));
                }
                if matches!(field, "pr" | "agr" | "ts")
                    && !active_ancestors(&candidate, target, &mut BTreeSet::new())
                {
                    return Err(err("destination is inactive or contains a cycle"));
                }
                if field == "rt" && dest.props.get("rr").is_none_or(Value::is_null) {
                    return Err(err("recurrence reference must point to a template"));
                }
                if field == "pn" {
                    let mut pending = vec![target];
                    let mut visited = BTreeSet::new();
                    while let Some(tag) = pending.pop() {
                        if tag == id || !visited.insert(tag) {
                            return Err(err("tag hierarchy contains a cycle"));
                        }
                        if let Some(parent) = candidate.entities.get(tag) {
                            pending.extend(ids(parent, "pn"));
                        }
                    }
                }
            }
        }
        if e.kind == "ChecklistItem3" && ids(e, "ts").count() != 1 {
            return Err(err("checklist items require exactly one task"));
        }
        if let Some(heading) = ids(e, "agr")
            .next()
            .filter(|h| candidate.entities.contains_key(*h))
        {
            let parent_ids: Vec<_> = ids(e, "pr").collect();
            if !parent_ids.is_empty()
                && parent_ids != ids(&candidate.entities[heading], "pr").collect::<Vec<_>>()
            {
                return Err(err("heading and project destinations do not match"));
            }
        }
        if e.props.get("rr").is_some_and(|r| !r.is_null()) && ids(e, "rt").next().is_some() {
            return Err(err("recurrence templates cannot also be instances"));
        }
        if matches!(e.kind.as_str(), "Task6" | "Task7")
            && e.props.get("tp").and_then(Value::as_i64) == Some(2)
            && ids(e, "pr").count() != 1
        {
            return Err(err("headings require exactly one project"));
        }
    }
    Ok(candidate)
}
fn validate_recurrence(rule: &Value) -> Result<(), String> {
    if rule.get("rrv").and_then(Value::as_i64) != Some(4)
        || !rule
            .get("fu")
            .and_then(Value::as_i64)
            .is_some_and(|n| [4, 8, 16, 256].contains(&n))
        || !rule
            .get("fa")
            .and_then(Value::as_i64)
            .is_some_and(|n| (1..=1000).contains(&n))
        || rule
            .get("of")
            .and_then(Value::as_array)
            .is_none_or(|a| a.is_empty())
    {
        return Err(err("unsupported recurrence rule; original rule preserved"));
    }
    Ok(())
}

pub async fn pull_with_progress(
    email: &str,
    password: &str,
    progress: ProgressCallback,
) -> Result<Snapshot, String> {
    let mut cloud = Cloud::new(ENDPOINT, Duration::from_secs(1))?;
    cloud.progress = Some(progress);
    cloud.pull(email, password, None).await
}
pub async fn pull(
    email: &str,
    password: &str,
    previous: Option<&Snapshot>,
) -> Result<Snapshot, String> {
    Cloud::new(ENDPOINT, Duration::from_secs(1))?
        .pull(email, password, previous)
        .await
}
pub(crate) async fn commit_classified(
    email: &str,
    password: &str,
    snapshot: &Snapshot,
    changes: Value,
) -> Result<Snapshot, CommitError> {
    Cloud::new(ENDPOINT, Duration::from_secs(1))
        .map_err(|e| CommitError::new(CommitDisposition::Retryable, e))?
        .commit_classified(email, password, snapshot, changes)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::{Arc, Mutex},
        thread,
    };

    #[tokio::test]
    async fn interrupted_get_restarts_whole_body_but_post_is_never_retried() {
        for method in [Method::GET, Method::POST] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            listener.set_nonblocking(true).unwrap();
            let endpoint = format!("http://{}", listener.local_addr().unwrap());
            let get = method == Method::GET;
            let server = thread::spawn(move || {
                for attempt in 0..if get { 2 } else { 1 } {
                    let deadline = Instant::now() + Duration::from_secs(5);
                    let mut stream = loop {
                        match listener.accept() {
                            Ok((stream, _)) => break stream,
                            Err(_) if Instant::now() < deadline => {
                                thread::sleep(Duration::from_millis(2))
                            }
                            Err(e) => panic!("missing test request: {e}"),
                        }
                    };
                    stream.set_nonblocking(false).unwrap();
                    stream
                        .set_read_timeout(Some(Duration::from_secs(5)))
                        .unwrap();
                    let mut request = [0; 8192];
                    stream.read(&mut request).unwrap();
                    if attempt == 0 {
                        stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\n{\"partial\":").unwrap();
                    } else {
                        stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}").unwrap();
                    }
                }
            });
            let mut cloud = Cloud::new(&endpoint, Duration::ZERO).unwrap();
            let result = cloud.request(method, "/history/SECRET", None, None).await;
            if get {
                assert_eq!(result.unwrap().1, json!({"ok":true}));
            } else {
                let error = result.unwrap_err();
                assert!(
                    error.contains("download interrupted during history download"),
                    "{error}"
                );
                assert!(error.contains("of 100"));
                assert!(!error.contains("SECRET"));
                assert!(!error.contains(&endpoint));
            }
            server.join().unwrap();
        }
    }

    #[tokio::test]
    async fn gzip_history_is_decoded_and_stalled_reads_are_classified_without_secrets() {
        for stalled in [false, true] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let endpoint = format!("http://{}", listener.local_addr().unwrap());
            let server = thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut request = [0; 8192];
                let n = stream.read(&mut request).unwrap();
                assert!(String::from_utf8_lossy(&request[..n]).contains("accept-encoding: gzip"));
                if stalled {
                    stream
                        .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n{")
                        .unwrap();
                    thread::sleep(Duration::from_millis(150));
                } else {
                    let compressed: &[u8] = &[
                        31, 139, 8, 0, 0, 0, 0, 0, 2, 255, 171, 86, 202, 207, 86, 178, 42, 41, 42,
                        77, 173, 5, 0, 144, 95, 212, 167, 11, 0, 0, 0,
                    ];
                    write!(stream, "HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", compressed.len()).unwrap();
                    stream.write_all(compressed).unwrap();
                }
            });
            let mut cloud = Cloud::new(&endpoint, Duration::ZERO).unwrap();
            if stalled {
                cloud.http = Client::builder()
                    .read_timeout(Duration::from_millis(50))
                    .build()
                    .unwrap();
            }
            let result = cloud
                .request_once(Method::GET, "/history/SECRET", None, None)
                .await;
            if stalled {
                let error = result.unwrap_err();
                assert!(error.contains("timed out"), "{error}");
                assert!(!error.contains("SECRET"));
            } else {
                assert_eq!(result.unwrap().1, json!({"ok":true}));
            }
            server.join().unwrap();
        }
    }

    fn task(title: &str) -> Value {
        json!({"t":0,"e":"Task6","p":{"tt":title,"tp":0,"st":0,"ss":0,"tr":false}})
    }
    fn batch(id: &str, event: Value) -> Value {
        let mut m = Map::new();
        m.insert(id.to_owned(), event);
        Value::Object(m)
    }
    fn page(head: u64, commits: Vec<Value>) -> Value {
        json!({"schema":301,"current-item-index":head,"items":commits})
    }
    fn verified() -> Value {
        json!({"status":"SYAccountStatusActive","history-key":"synthetic-history"})
    }
    fn snapshot(id: &str) -> Snapshot {
        let mut s = Snapshot {
            history: "synthetic-history".into(),
            ..Default::default()
        };
        apply_batch(&mut s, &batch(id, task("Original"))).unwrap();
        s
    }
    #[derive(Clone)]
    struct Recorded {
        line: String,
        headers: String,
        body: Value,
    }
    struct Fake {
        url: String,
        requests: Arc<Mutex<Vec<Recorded>>>,
        handle: thread::JoinHandle<()>,
    }
    impl Fake {
        fn new(responses: Vec<(u16, String)>) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            listener.set_nonblocking(true).unwrap();
            let url = format!("http://{}", listener.local_addr().unwrap());
            let requests = Arc::new(Mutex::new(Vec::new()));
            let records = requests.clone();
            let handle = thread::spawn(move || {
                for (status, body) in responses {
                    let deadline = Instant::now() + Duration::from_secs(10);
                    let mut stream = loop {
                        match listener.accept() {
                            Ok((stream, _)) => break stream,
                            Err(e)
                                if e.kind() == std::io::ErrorKind::WouldBlock
                                    && Instant::now() < deadline =>
                            {
                                thread::sleep(Duration::from_millis(2))
                            }
                            other => panic!(
                                "fake server never received expected request: {:?}",
                                other.err()
                            ),
                        }
                    };
                    // macOS accepted sockets can inherit the listener's nonblocking flag.
                    stream.set_nonblocking(false).unwrap();
                    stream
                        .set_read_timeout(Some(Duration::from_secs(5)))
                        .unwrap();
                    let mut buf = Vec::new();
                    let mut chunk = [0; 4096];
                    let header_end = loop {
                        let n = stream.read(&mut chunk).unwrap();
                        assert!(n > 0);
                        buf.extend_from_slice(&chunk[..n]);
                        if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                            break i + 4;
                        }
                    };
                    let headers = String::from_utf8(buf[..header_end].to_vec()).unwrap();
                    let length: usize = headers
                        .lines()
                        .find_map(|line| {
                            let (name, value) = line.split_once(':')?;
                            name.eq_ignore_ascii_case("content-length")
                                .then(|| value.trim().parse().unwrap())
                        })
                        .unwrap_or(0);
                    while buf.len() < header_end + length {
                        let n = stream.read(&mut chunk).unwrap();
                        assert!(n > 0);
                        buf.extend_from_slice(&chunk[..n]);
                    }
                    records.lock().unwrap().push(Recorded {
                        line: headers.lines().next().unwrap().into(),
                        headers,
                        body: if length == 0 {
                            Value::Null
                        } else {
                            serde_json::from_slice(&buf[header_end..header_end + length]).unwrap()
                        },
                    });
                    write!(stream, "HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
                }
            });
            Self {
                url,
                requests,
                handle,
            }
        }
        fn json(values: Vec<Value>) -> Self {
            Self::new(values.into_iter().map(|v| (200, v.to_string())).collect())
        }
        fn client(&self) -> Cloud {
            Cloud::new(&self.url, Duration::ZERO).unwrap()
        }
        fn finish(self) -> Vec<Recorded> {
            self.handle.join().unwrap();
            self.requests.lock().unwrap().clone()
        }
    }

    #[test]
    fn secret_is_never_serialized() {
        let s = Snapshot {
            history: "a-secret-capability".into(),
            ..Default::default()
        };
        assert!(!serde_json::to_string(&s).unwrap().contains("a-secret"));
        assert!(serde_json::from_str::<Snapshot>(
            r#"{"entities":{},"head":0,"history":"injected"}"#
        )
        .unwrap()
        .history
        .is_empty());
    }
    #[test]
    fn ids_round_trip_and_legacy_is_case_sensitive() {
        for _ in 0..100 {
            assert!(canonical_id(&new_id()));
        }
        let id = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
        assert_ne!(legacy_id(id), legacy_id(&id.to_lowercase()));
        assert!(canonical_id(&legacy_id(id)));
        assert_eq!(legacy_id(&legacy_id(id)), legacy_id(id));
        assert_ne!(
            legacy_id(&format!("{id}-20240131")),
            bs58::encode(&Sha1::digest(format!("{id}-20240131"))[..16]).into_string()
        );
        assert!(!canonical_id("bad-id"));
    }
    #[test]
    fn legacy_relationships_and_tombstones_are_normalized() {
        let old = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
        let parent = "11111111-2222-3333-4444-555555555555";
        let mut s = Snapshot::default();
        apply_batch(
            &mut s,
            &batch(
                old,
                json!({"t":0,"e":"Task3","p":{"tt":"Legacy","pr":[parent]}}),
            ),
        )
        .unwrap();
        assert_eq!(
            s.entities[&legacy_id(old)].props["pr"][0],
            legacy_id(parent)
        );
        apply_batch(
            &mut s,
            &batch(
                "TOMBSTONE-legacy",
                json!({"t":0,"e":"Tombstone","p":{"dloid":old}}),
            ),
        )
        .unwrap();
        assert!(s.entities.is_empty());
    }
    #[test]
    fn compact_full_notes_do_not_require_a_type_or_empty_value() {
        for value in [
            json!({"_t":"tx","v":"café 😀"}),
            json!({"_t":"tx","t":0,"v":"café 😀"}),
            json!({"_t":"tx","t":3,"v":"café 😀"}),
        ] {
            assert_eq!(apply_note(None, &value).unwrap(), note("café 😀"));
        }
        assert_eq!(
            apply_note(None, &json!({"_t":"tx","t":1,"ch":0})).unwrap(),
            note("")
        );
        assert_eq!(
            apply_note(None, &json!({"_t":"tx","ch":0})).unwrap(),
            note("")
        );
        let error =
            apply_note(None, &json!({"t":99,"v":"PRIVATE NOTE CONTENT","ps":[]})).unwrap_err();
        assert!(error.contains("type 99, value text, patches array"));
        assert!(!error.contains("PRIVATE"));
        assert!(apply_note(None, &json!({"ps":[]})).is_err());
    }
    #[test]
    fn type_zero_note_marker_preserves_existing_text_and_initializes_empty_notes() {
        let original = note("Keep this note 😀");
        for marker in [
            json!({"t":0}),
            json!({"_t":"tx","t":0}),
            json!({"_t":"tx","t":0,"ch":0}),
        ] {
            assert_eq!(apply_note(Some(&original), &marker).unwrap(), original);
            assert_eq!(apply_note(None, &marker).unwrap(), note(""));
        }
        assert!(apply_note(Some(&original), &json!({"t":0,"ps":[]})).is_err());
    }
    #[test]
    fn patch_null_and_unicode_notes_preserve_semantics() {
        let id = new_id();
        let mut s = snapshot(&id);
        apply_batch(&mut s, &batch(&id, json!({"t":1,"e":"Task6","p":{"nt":note("A😀BC"),"dd":1790035200,"xx":{"future":123}}}))).unwrap();
        apply_batch(&mut s, &batch(&id, json!({"t":1,"e":"Task6","p":{"nt":{"t":2,"ps":[{"p":1,"l":1,"r":"é"}]},"dd":null}}))).unwrap();
        assert_eq!(s.entities[&id].props["nt"], note("AéBC"));
        assert!(s.entities[&id].props["dd"].is_null());
        assert_eq!(s.entities[&id].props["tt"], "Original");
        assert_eq!(s.entities[&id].props["xx"]["future"], 123);
    }
    #[test]
    fn native_task7_migration_preserves_fields_and_wire_kind() {
        let id = new_id();
        let mut s = snapshot(&id);
        apply_batch(&mut s, &batch(&id, json!({"e":"Task7","t":1,"p":{"nt":{"t":0},"futureField":{"opaque":[1,2]},"rp":"opaque-native-repeater","rmd":1792713600,"lt":true}}))).unwrap();
        assert_eq!(s.entities[&id].kind, "Task7");
        assert_eq!(s.entities[&id].props["tt"], "Original");
        let changes = batch(&id, json!({"e":"Task7","t":1,"p":{"tt":"Edited"}}));
        let edited = validate_write(&s, &changes).unwrap();
        assert_eq!(
            edited.entities[&id].props["futureField"],
            json!({"opaque":[1,2]})
        );
        assert_eq!(edited.entities[&id].kind, "Task7");
        assert_eq!(edited.entities[&id].props["rp"], "opaque-native-repeater");
        assert!(validate_write(
            &s,
            &batch(&id, json!({"e":"Task6","t":1,"p":{"tt":"Downgrade"}}))
        )
        .is_err());
    }
    #[test]
    fn ancillary_entities_are_retained_updated_and_deleted_without_task_coercion() {
        for kind in ["Contact2", "Command3", "SmartList"] {
            let id = new_id();
            let mut s = Snapshot::default();
            apply_batch(
                &mut s,
                &batch(
                    &id,
                    json!({"e":kind,"t":0,"p":{"nt":{"opaque":true},"definition":[1,2]}}),
                ),
            )
            .unwrap();
            apply_batch(&mut s, &batch(&id, json!({"e":kind,"t":1,"p":{"x":42}}))).unwrap();
            assert_eq!(s.entities[&id].props["nt"], json!({"opaque":true}));
            assert_eq!(s.entities[&id].props["definition"], json!([1, 2]));
            assert!(validate_write(
                &s,
                &batch(&id, json!({"e":kind,"t":1,"p":{"tt":"Unsupported edit"}}))
            )
            .is_err());
            apply_batch(&mut s, &batch(&id, json!({"e":kind,"t":2,"p":{}}))).unwrap();
            assert!(s.entities.is_empty());
        }
    }
    #[test]
    fn only_versioned_settings_are_ignored() {
        let mut s = Snapshot::default();
        apply_batch(
            &mut s,
            &batch(
                "settings",
                json!({"e":"Settings99","t":99,"p":"future metadata"}),
            ),
        )
        .unwrap();
        for kind in ["Settings", "SettingsX", "Task99"] {
            assert!(
                apply_batch(&mut s, &batch(&new_id(), json!({"e":kind,"t":0,"p":{}}))).is_err()
            );
        }
        assert!(apply_batch(&mut s, &batch(&new_id(), json!({"e":"Task6","t":7,"p":{}}))).is_err());
    }
    #[test]
    fn writes_validate_destinations_dates_and_notes() {
        let id = new_id();
        let mut s = snapshot(&id);
        let project = new_id();
        apply_batch(
            &mut s,
            &batch(
                &project,
                json!({"e":"Task6","t":0,"p":{"tt":"Closed","tp":1,"ss":3}}),
            ),
        )
        .unwrap();
        let move_change = batch(&id, json!({"e":"Task6","t":1,"p":{"pr":[project]}}));
        assert!(validate_write(&s, &move_change)
            .unwrap_err()
            .contains("inactive"));
        assert!(
            validate_write(&s, &batch(&id, json!({"e":"Task6","t":1,"p":{"dd":12345}}))).is_err()
        );
        assert!(validate_write(
            &s,
            &batch(
                &id,
                json!({"e":"Task6","t":1,"p":{"nt":{"_t":"tx","t":1,"v":"text","ch":0}}})
            )
        )
        .is_err());
        let updated = validate_write(
            &s,
            &batch(
                &id,
                json!({"e":"Task6","t":1,"p":{"nt":note("text"),"dd":null}}),
            ),
        )
        .unwrap();
        assert_eq!(updated.entities[&id].props["nt"], note("text"));
    }
    #[test]
    fn project_creation_requires_boolean_trash_and_preserves_existing_drafts() {
        use crate::{store, workflow};

        let mut workspace = store::Workspace::default();
        for kind in ["Task6", "Task7"] {
            let id = new_id();
            workspace = workflow::mutate(
                &workspace,
                batch(&id, json!({"e":kind,"t":0,"p":{"tt":"Project","tp":1}})),
                false,
                true,
            )
            .unwrap();
            assert_eq!(workspace.snapshot.entities[&id].props["tr"], false);
            assert_eq!(
                workspace.pending.last().unwrap().changes[&id]["p"]["tr"],
                false
            );
            for trashed in [false, true] {
                let updated = validate_write(
                    &workspace.snapshot,
                    &batch(&id, json!({"e":kind,"t":1,"p":{"tr":trashed}})),
                )
                .unwrap();
                assert_eq!(updated.entities[&id].props["tr"], trashed);
            }
        }
        let before = serde_json::to_vec(&workspace).unwrap();
        // The frontend's former tr:0 default overrides the valid native default.
        for tr in [
            json!(0),
            json!(1),
            json!(0.0),
            json!("false"),
            json!([]),
            json!({}),
            Value::Null,
        ] {
            let failure = workflow::mutate(
                &workspace,
                batch(
                    &new_id(),
                    json!({"e":"Task6","t":0,"p":{"tt":"Project","tp":1,"tr":tr}}),
                ),
                false,
                true,
            );
            assert!(failure.is_err(), "accepted malformed tr: {tr}");
            assert_eq!(serde_json::to_vec(&workspace).unwrap(), before);
        }
    }
    #[tokio::test]
    async fn malformed_trash_on_later_history_page_preserves_graph_and_cursor() {
        let id = new_id();
        let mut old = snapshot(&id);
        old.head = 4;
        let before = serde_json::to_vec(&old).unwrap();
        let fake = Fake::json(vec![
            verified(),
            page(
                6,
                vec![batch(
                    &id,
                    json!({"e":"Task6","t":1,"p":{"tt":"Partial edit"}}),
                )],
            ),
            page(6, vec![batch(&id, json!({"e":"Task6","t":1,"p":{"tr":0}}))]),
        ]);
        let failure = fake
            .client()
            .pull("test@example.invalid", "synthetic-password", Some(&old))
            .await
            .err()
            .unwrap();
        assert!(failure.contains("invalid field type for tr"));
        assert_eq!(serde_json::to_vec(&old).unwrap(), before);
        let requests = fake.finish();
        assert_eq!(requests.len(), 3);
        assert!(requests[1].line.contains("start-index=4"));
        assert!(requests[2].line.contains("start-index=5"));
        assert!(requests
            .iter()
            .all(|request| request.line.starts_with("GET ")));
    }
    #[test]
    fn recurrence_commit_is_atomic_and_templates_are_linked() {
        let template = new_id();
        let instance = new_id();
        let mut changes = Map::new();
        changes.insert(template.clone(), json!({"e":"Task6","t":0,"p":{"tt":"Repeat","tp":0,"rr":{"rrv":4,"fu":16,"fa":1,"of":[{"dy":0}]},"icsd":0}}));
        changes.insert(
            instance.clone(),
            json!({"e":"Task6","t":0,"p":{"tt":"Repeat","tp":0,"rt":[template],"rr":null}}),
        );
        let s = validate_write(&Snapshot::default(), &Value::Object(changes)).unwrap();
        assert_eq!(s.entities.len(), 2);
        assert_eq!(s.entities[&instance].props["rt"][0], template);
    }
    #[test]
    fn conflict_detection_allows_unrelated_remote_edits() {
        let id = new_id();
        let old = snapshot(&id);
        let mut new = old.clone();
        new.entities.get_mut(&id).unwrap().props["nt"] = note("Remote note");
        let edit = batch(&id, json!({"e":"Task6","t":1,"p":{"tt":"Local title"}}));
        assert!(check_conflicts(&old, &new, &edit).is_ok());
        new.entities.get_mut(&id).unwrap().props["tt"] = json!("Remote title");
        assert!(check_conflicts(&old, &new, &edit).is_err());
    }
    #[tokio::test]
    async fn connection_progress_reports_actual_transfer_and_item_count_without_content() {
        let fake = Fake::json(vec![
            verified(),
            page(1, vec![batch(&new_id(), task("PRIVATE TASK TITLE"))]),
        ]);
        let updates = Arc::new(Mutex::new(Vec::new()));
        let output = updates.clone();
        let mut client = fake.client();
        client.progress = Some(Box::new(move |update| output.lock().unwrap().push(update)));
        client
            .pull("private@example.invalid", "PRIVATE PASSWORD", None)
            .await
            .unwrap();
        let updates = updates.lock().unwrap();
        assert_eq!(updates.first().unwrap().stage, "verifying");
        assert!(updates.iter().any(|p| p.stage == "downloading"));
        assert_eq!(updates.last().unwrap().items, 1);
        assert!(updates.last().unwrap().received_bytes > 0);
        let serialized = serde_json::to_string(&*updates).unwrap();
        assert!(!serialized.contains("PRIVATE"));
        assert!(!serialized.contains("example.invalid"));
        fake.finish();
    }
    #[tokio::test]
    async fn mixed_task_versions_replay_across_pages_and_incremental_pulls() {
        let id = new_id();
        let fake = Fake::json(vec![
            verified(),
            page(3, vec![batch(&id, task("Original"))]),
            page(
                3,
                vec![batch(
                    &id,
                    json!({"e":"Task7","t":1,"p":{"rp":"native-repeater","nt":note("Keep notes")}}),
                )],
            ),
            page(
                3,
                vec![batch(
                    &id,
                    json!({"e":"Task6","t":1,"p":{"tt":"Older client edit"}}),
                )],
            ),
            verified(),
            page(
                4,
                vec![batch(
                    &id,
                    json!({"e":"Task4","t":1,"p":{"dd":null,"nt":{"t":0}}}),
                )],
            ),
        ]);
        let mut client = fake.client();
        let first = client
            .pull("fixture@example.invalid", "synthetic", None)
            .await
            .unwrap();
        let final_state = client
            .pull("fixture@example.invalid", "synthetic", Some(&first))
            .await
            .unwrap();
        assert_eq!(first.head, 3);
        assert_eq!(final_state.head, 4);
        let entity = &final_state.entities[&id];
        assert_eq!(entity.kind, "Task7");
        assert_eq!(entity.props["rp"], "native-repeater");
        assert_eq!(entity.props["nt"], note("Keep notes"));
        assert_eq!(entity.props["tt"], "Older client edit");
        assert!(entity.props["dd"].is_null());
        let requests = fake.finish();
        assert!(requests[5].line.contains("start-index=3"));
    }
    #[test]
    fn unrelated_entity_type_changes_still_fail_without_modifying_entity() {
        let id = new_id();
        let mut state = snapshot(&id);
        let before = state.entities.clone();
        let message = apply_batch(
            &mut state,
            &batch(&id, json!({"e":"Tag4","t":1,"p":{"tt":"Wrong kind"}})),
        )
        .unwrap_err();
        assert!(message.contains("Task6 → Tag4"));
        assert!(!message.contains(&id));
        assert_eq!(state.entities, before);
    }
    #[tokio::test]
    async fn pagination_counts_commits_not_entities_and_uses_password_auth() {
        let a = new_id();
        let b = new_id();
        let mut first = Map::new();
        first.insert(a.clone(), task("One"));
        first.insert(b.clone(), task("Two"));
        let fake = Fake::json(vec![
            verified(),
            page(2, vec![Value::Object(first)]),
            page(
                2,
                vec![batch(&a, json!({"e":"Task6","t":1,"p":{"tt":"Edited"}}))],
            ),
        ]);
        let s = fake
            .client()
            .pull("a+b@example.com", "synthetic-password", None)
            .await
            .unwrap();
        assert_eq!(s.head, 2);
        assert_eq!(s.entities.len(), 2);
        assert_eq!(s.entities[&a].props["tt"], "Edited");
        let requests = fake.finish();
        assert!(requests[0]
            .headers
            .to_lowercase()
            .contains("authorization: password synthetic-password"));
        assert!(!requests[1]
            .headers
            .to_lowercase()
            .contains("authorization:"));
        assert!(requests[2].line.contains("start-index=1"));
    }
    #[tokio::test]
    async fn later_page_failure_does_not_mutate_original_or_restart_from_zero() {
        let id = new_id();
        let old = snapshot(&id);
        let old_bytes = serde_json::to_vec(&old).unwrap();
        let fake = Fake::new(vec![
            (200, verified().to_string()),
            (
                200,
                page(
                    2,
                    vec![batch(&id, json!({"e":"Task6","t":1,"p":{"tt":"Partial"}}))],
                )
                .to_string(),
            ),
            (500, String::new()),
        ]);
        assert!(fake
            .client()
            .pull("test@example.com", "synthetic-password", Some(&old))
            .await
            .is_err());
        assert_eq!(serde_json::to_vec(&old).unwrap(), old_bytes);
        let requests = fake.finish();
        assert_eq!(requests.len(), 3);
        assert!(requests[2].line.contains("start-index=1"));
    }
    #[tokio::test]
    async fn malformed_pagination_and_unknown_schema_are_rejected() {
        for response in [
            page(2, vec![]),
            json!({"schema":302,"current-item-index":0,"items":[]}),
            json!({"current-item-index":0,"items":[]}),
            page(0, vec![batch(&new_id(), task("Beyond head"))]),
        ] {
            let fake = Fake::json(vec![verified(), response]);
            assert!(fake
                .client()
                .pull("test@example.com", "synthetic-password", None)
                .await
                .is_err());
            fake.finish();
        }
        let mut previous = Snapshot {
            history: "synthetic-history".into(),
            ..Default::default()
        };
        previous.head = 5;
        let fake = Fake::json(vec![verified(), page(4, vec![])]);
        assert!(fake
            .client()
            .pull("test@example.com", "synthetic-password", Some(&previous))
            .await
            .is_err());
        fake.finish();
    }
    #[tokio::test]
    async fn preflight_network_failure_is_retryable_and_does_not_send_post() {
        let id = new_id();
        let current = snapshot(&id);
        let changes = batch(&id, json!({"e":"Task6","t":1,"p":{"tt":"Draft"}}));
        let fake = Fake::new(vec![(503, String::new())]);
        let failure = fake
            .client()
            .commit_classified("test@example.com", "synthetic-password", &current, changes)
            .await
            .unwrap_err();
        assert_eq!(failure.disposition, CommitDisposition::Retryable);
        assert!(fake.finish().iter().all(|r| !r.line.starts_with("POST")));
    }
    #[tokio::test]
    async fn confirmed_commit_applies_without_post_commit_read() {
        let id = new_id();
        let s = snapshot(&id);
        let changes = batch(&id, json!({"e":"Task6","t":1,"p":{"tt":"Saved"}}));
        let fake = Fake::json(vec![
            verified(),
            page(0, vec![]),
            json!({"server-head-index":1}),
        ]);
        let result = fake
            .client()
            .commit(
                "test@example.com",
                "synthetic-password",
                &s,
                changes.clone(),
            )
            .await
            .unwrap();
        assert_eq!(result.head, 1);
        assert_eq!(result.entities[&id].props["tt"], "Saved");
        let requests = fake.finish();
        assert_eq!(requests.len(), 3);
        assert_eq!(requests[2].body, changes);
        assert!(requests[2].line.contains("ancestor-index=0&_cnt=1"));
        assert!(requests[2].headers.to_lowercase().contains("schema: 301"));
    }
    #[tokio::test]
    async fn uncertain_commit_is_reconciled_exactly_without_resending() {
        let id = new_id();
        let s = snapshot(&id);
        let changes = batch(&id, json!({"e":"Task6","t":1,"p":{"tt":"Saved"}}));
        let fake = Fake::new(vec![
            (200, verified().to_string()),
            (200, page(0, vec![]).to_string()),
            (200, "{\"server-head-index\":".into()),
            (200, page(1, vec![changes.clone()]).to_string()),
        ]);
        let result = fake
            .client()
            .commit("test@example.com", "synthetic-password", &s, changes)
            .await
            .unwrap();
        assert_eq!(result.entities[&id].props["tt"], "Saved");
        assert_eq!(
            fake.finish()
                .iter()
                .filter(|r| r.line.starts_with("POST"))
                .count(),
            1
        );
    }
    #[tokio::test]
    async fn unconfirmed_commit_returns_explicit_uncertainty() {
        let id = new_id();
        let s = snapshot(&id);
        let changes = batch(&id, json!({"e":"Task6","t":1,"p":{"tt":"Saved"}}));
        let different = batch(
            &id,
            json!({"e":"Task6","t":1,"p":{"tt":"Someone else's save"}}),
        );
        let fake = Fake::new(vec![
            (200, verified().to_string()),
            (200, page(0, vec![]).to_string()),
            (500, String::new()),
            (200, page(1, vec![different]).to_string()),
        ]);
        let error = fake
            .client()
            .commit("test@example.com", "synthetic-password", &s, changes)
            .await
            .unwrap_err();
        assert!(error.contains("UNCERTAIN_COMMIT"));
        assert!(!error.contains("synthetic-history"));
        assert_eq!(
            fake.finish()
                .iter()
                .filter(|r| r.line.starts_with("POST"))
                .count(),
            1
        );
    }
    #[tokio::test]
    async fn authentication_errors_are_sanitized_and_history_switch_is_rejected() {
        for status in [401, 429] {
            let fake = Fake::new(vec![(status, "secret server message".into())]);
            let error = fake
                .client()
                .pull("test@example.com", "do-not-leak", None)
                .await
                .unwrap_err();
            assert!(!error.contains("do-not-leak"));
            assert!(!error.contains("secret server"));
            fake.finish();
        }
        let fake = Fake::json(vec![verified()]);
        let previous = Snapshot {
            history: "another-account".into(),
            ..Default::default()
        };
        assert!(fake
            .client()
            .pull("test@example.com", "synthetic-password", Some(&previous))
            .await
            .unwrap_err()
            .contains("history changed"));
        fake.finish();
    }
}

impl std::fmt::Debug for Snapshot {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Snapshot")
            .field("entity_count", &self.entities.len())
            .field("head", &self.head)
            .field("history", &"[REDACTED]")
            .finish()
    }
}

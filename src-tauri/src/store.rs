use crate::cloud::{Entity, Snapshot};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::BTreeMap, path::Path};

#[derive(Clone, Serialize, Deserialize)]
pub struct Pending {
    pub changes: Value,
    pub base: BTreeMap<String, Option<Entity>>,
    pub status: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub snapshot: Snapshot,
    /// Last fully validated cloud state, never reconstructed by undoing drafts.
    #[serde(default)]
    pub authoritative: Option<Snapshot>,
    /// Non-secret one-way identity binding survives disconnect without retaining the capability.
    #[serde(default)]
    pub history_fingerprint: Option<String>,
    pub pending: Vec<Pending>,
    pub last_sync: Option<String>,
}
impl Default for Workspace {
    fn default() -> Self {
        Self {
            snapshot: Snapshot {
                entities: BTreeMap::new(),
                head: 0,
                history: String::new(),
            },
            authoritative: None,
            history_fingerprint: None,
            pending: vec![],
            last_sync: None,
        }
    }
}
pub struct Store {
    db: Connection,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self, String> {
        let db = Connection::open(path).map_err(|e| e.to_string())?;
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS workspace (account TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);").map_err(|e|e.to_string())?;
        Ok(Self { db })
    }
    pub fn load(&self, account: &str) -> Result<Workspace, String> {
        match self.db.query_row(
            "SELECT data FROM workspace WHERE account=?",
            [account],
            |r| r.get::<_, String>(0),
        ) {
            Ok(v) => serde_json::from_str(&v).map_err(|e| e.to_string()),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(Workspace::default()),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn save(&self, account: &str, w: &Workspace) -> Result<(), String> {
        let body = serde_json::to_string(w).map_err(|e| e.to_string())?;
        self.db.execute("INSERT INTO workspace(account,data) VALUES(?,?) ON CONFLICT(account) DO UPDATE SET data=excluded.data",params![account,body]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn config(&self, key: &str) -> Option<String> {
        self.db
            .query_row("SELECT value FROM config WHERE key=?", [key], |r| r.get(0))
            .ok()
    }
    pub fn set_config(&self, key: &str, value: &str) -> Result<(), String> {
        self.db.execute("INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,value]).map_err(|e|e.to_string())?;
        Ok(())
    }
}
pub fn id() -> String {
    crate::cloud::new_id()
}
pub fn note(text: &str) -> Value {
    crate::cloud::note(text)
}

/// Supply the complete create payload expected by Things. Existing updates remain partial.
pub fn prepare(changes: Value) -> Result<Value, String> {
    let mut changes = changes
        .as_object()
        .cloned()
        .ok_or("Changes must be an object")?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "System clock is invalid")?
        .as_secs_f64();
    for event in changes.values_mut() {
        if event["t"].as_u64() != Some(0) {
            continue;
        }
        let supplied = event["p"]
            .as_object()
            .cloned()
            .ok_or("Missing create payload")?;
        let mut defaults = match event["e"].as_str() {
            Some("Task6" | "Task7") => {
                json!({"tp":0,"sr":null,"dds":null,"rt":[],"rmd":null,"ss":0,"tr":false,"dl":[],"icp":false,"st":0,"ar":[],"tt":"","do":0,"lai":null,"tir":null,"tg":[],"agr":[],"ix":0,"cd":now,"lt":false,"icc":0,"md":null,"ti":0,"dd":null,"ato":null,"nt":note(""),"icsd":null,"pr":[],"rp":null,"acrd":null,"sp":null,"sb":0,"rr":null,"xx":{"sn":{},"_t":"oo"}})
            }
            Some("Area3") => json!({"tt":"","ix":0,"tg":[],"xx":{"sn":{},"_t":"oo"}}),
            Some("Tag4") => json!({"tt":"","ix":0,"sh":null,"pn":[],"xx":{"sn":{},"_t":"oo"}}),
            Some("ChecklistItem3") => {
                json!({"cd":now,"md":null,"tt":"","ss":0,"sp":null,"ix":0,"ts":[],"lt":false,"xx":{"sn":{},"_t":"oo"}})
            }
            _ => return Err("Unsupported create entity".into()),
        };
        let default_schedule = matches!(event["e"].as_str(), Some("Task6" | "Task7"))
            && !supplied.contains_key("st")
            && (supplied.get("tp").and_then(Value::as_i64).unwrap_or(0) != 0
                || ["ar", "pr", "agr"].iter().any(|k| {
                    supplied
                        .get(*k)
                        .and_then(Value::as_array)
                        .is_some_and(|a| !a.is_empty())
                }));
        defaults.as_object_mut().unwrap().extend(supplied);
        if default_schedule {
            defaults["st"] = json!(1);
        }
        event["p"] = defaults;
    }
    Ok(Value::Object(changes))
}

pub fn active(id: &str, entities: &BTreeMap<String, Entity>) -> bool {
    fn walk(id: &str, all: &BTreeMap<String, Entity>, seen: &mut Vec<String>) -> bool {
        if seen.iter().any(|x| x == id) {
            return false;
        }
        seen.push(id.into());
        let Some(e) = all.get(id) else {
            return false;
        };
        if e.props["tr"] == true || e.props["ss"].as_i64().unwrap_or(0) != 0 {
            return false;
        }
        for field in ["pr", "agr"] {
            if let Some(a) = e.props[field].as_array() {
                for p in a {
                    if !walk(p.as_str().unwrap_or(""), all, seen) {
                        return false;
                    }
                }
            }
        }
        seen.pop();
        true
    }
    walk(id, entities, &mut vec![])
}

/// Replay into a clone so malformed later events never partially mutate the caller's state.
pub fn apply(entities: &mut BTreeMap<String, Entity>, changes: &Value) -> Result<(), String> {
    let mut candidate = Snapshot {
        entities: entities.clone(),
        ..Default::default()
    };
    crate::cloud::apply_batch(&mut candidate, changes)?;
    *entities = candidate.entities;
    Ok(())
}
pub fn validate(entities: &BTreeMap<String, Entity>, changes: &Value) -> Result<(), String> {
    let batch = changes.as_object().ok_or("Invalid changes")?;
    if batch.is_empty() || batch.len() > 500 {
        return Err("Choose between 1 and 500 changes".into());
    }
    let snapshot = Snapshot {
        entities: entities.clone(),
        ..Default::default()
    };
    crate::cloud::validate_write(&snapshot, changes).map(|_| ())
}

pub fn conflicts(p: &Pending, remote: &BTreeMap<String, Entity>) -> bool {
    let Some(changes) = p.changes.as_object() else {
        return true;
    };
    changes.iter().any(|(id, event)| {
        let current = remote.get(id);
        let base = p.base.get(id).and_then(|v| v.as_ref());
        match event["t"].as_u64() {
            Some(0) => current.is_some(),
            Some(2) => current != base,
            Some(1) => {
                let (Some(current), Some(base), Some(props)) =
                    (current, base, event["p"].as_object())
                else {
                    return true;
                };
                current.kind != base.kind
                    || props
                        .keys()
                        .filter(|k| k.as_str() != "md")
                        .any(|k| current.props.get(k) != base.props.get(k))
            }
            _ => true,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persistence_is_atomic_and_excludes_history() {
        let p = std::env::temp_dir().join(format!("things-{}.db", id()));
        let s = Store::open(&p).unwrap();
        let mut w = Workspace::default();
        w.snapshot.history = "SECRET".into();
        s.save("local", &w).unwrap();
        assert!(s.load("local").unwrap().snapshot.history.is_empty());
        drop(s);
        std::fs::remove_file(p).unwrap();
    }
    #[test]
    fn completed_parent_hides_child() {
        let mut es = BTreeMap::new();
        es.insert(
            "p".into(),
            Entity {
                id: "p".into(),
                kind: "Task6".into(),
                props: json!({"ss":3}),
            },
        );
        es.insert(
            "c".into(),
            Entity {
                id: "c".into(),
                kind: "Task6".into(),
                props: json!({"pr":["p"]}),
            },
        );
        assert!(!active("c", &es));
    }
    #[test]
    fn malformed_move_never_applies() {
        let i = id();
        let c = json!({i:{"e":"Task6","t":0,"p":{"tt":"Hello","pr":["missing"]}}});
        assert!(validate(&BTreeMap::new(), &c).is_err());
    }
    #[test]
    fn crc_is_real() {
        assert_eq!(note("hello")["ch"], 907060870u64);
    }
    fn create(entity_id: &str, kind: &str, props: Value) -> Value {
        let mut map = serde_json::Map::new();
        map.insert(entity_id.to_owned(), json!({"t":0,"e":kind,"p":props}));
        prepare(Value::Object(map)).unwrap()
    }
    #[test]
    fn complete_create_defaults_and_reopening_survive_persistence() {
        let task = id();
        let changes = create(&task, "Task6", json!({"tt":"Real task"}));
        let mut entities = BTreeMap::new();
        validate(&entities, &changes).unwrap();
        apply(&mut entities, &changes).unwrap();
        assert_eq!(entities[&task].props["nt"], note(""));
        assert!(entities[&task].props.get("dds").unwrap().is_null());
        let complete = json!({task.clone():{"e":"Task6","t":1,"p":{"ss":3,"sp":123.5}}});
        validate(&entities, &complete).unwrap();
        apply(&mut entities, &complete).unwrap();
        assert!(!active(&task, &entities));
        let reopen = json!({task.clone():{"e":"Task6","t":1,"p":{"ss":0,"sp":null}}});
        validate(&entities, &reopen).unwrap();
        apply(&mut entities, &reopen).unwrap();
        assert!(active(&task, &entities));
        assert!(entities[&task].props["sp"].is_null());
    }
    #[test]
    fn malformed_later_event_rolls_back_whole_local_batch() {
        let a = id();
        let b = id();
        let mut entities = BTreeMap::new();
        let changes =
            json!({a:{"e":"Task6","t":0,"p":{"tt":"Valid"}},b:{"e":"Task99","t":0,"p":{}}});
        assert!(apply(&mut entities, &changes).is_err());
        assert!(entities.is_empty());
    }
    #[test]
    fn native_heading_only_relationship_is_valid_and_inherits_parent_state() {
        let project = id();
        let heading = id();
        let task = id();
        let mut entities = BTreeMap::new();
        for changes in [
            create(&project, "Task6", json!({"tt":"Project","tp":1})),
            create(
                &heading,
                "Task6",
                json!({"tt":"Heading","tp":2,"pr":[project]}),
            ),
            create(&task, "Task6", json!({"tt":"Task","agr":[heading]})),
        ] {
            validate(&entities, &changes).unwrap();
            apply(&mut entities, &changes).unwrap();
        }
        assert!(active(&task, &entities));
        let trash = json!({project.clone():{"e":"Task6","t":1,"p":{"tr":true}}});
        apply(&mut entities, &trash).unwrap();
        assert!(!active(&task, &entities));
        let move_task = id();
        let changes = create(
            &move_task,
            "Task6",
            json!({"tt":"Rejected","agr":[heading]}),
        );
        assert!(validate(&entities, &changes).is_err());
    }
    #[test]
    fn unrelated_remote_note_and_modification_date_do_not_conflict_with_title_draft() {
        let task = id();
        let mut original = BTreeMap::new();
        apply(
            &mut original,
            &create(&task, "Task6", json!({"tt":"Before"})),
        )
        .unwrap();
        let mut remote = original.clone();
        remote.get_mut(&task).unwrap().props["nt"] = note("A remote note");
        remote.get_mut(&task).unwrap().props["md"] = json!(456.0);
        let pending = Pending {
            changes: json!({task.clone():{"e":"Task6","t":1,"p":{"tt":"After","md":123.0}}}),
            base: original.into_iter().map(|(k, v)| (k, Some(v))).collect(),
            status: "queued".into(),
        };
        assert!(!conflicts(&pending, &remote));
        remote.get_mut(&task).unwrap().props["tt"] = json!("Someone else");
        assert!(conflicts(&pending, &remote));
        remote.remove(&task);
        assert!(conflicts(&pending, &remote));
    }
    #[test]
    fn unknown_mutation_fields_and_invalid_note_crc_are_rejected() {
        let task = id();
        let mut entities = BTreeMap::new();
        apply(&mut entities, &create(&task, "Task6", json!({"tt":"Task"}))).unwrap();
        for props in [
            json!({"futureUnknown":"do not write"}),
            json!({"nt":{"t":1,"_t":"tx","v":"hello","ch":0}}),
            json!({"dd":1234}),
            json!({"tr":null}),
            json!({"ss":1}),
        ] {
            assert!(validate(
                &entities,
                &json!({task.clone():{"e":"Task6","t":1,"p":props}})
            )
            .is_err());
        }
    }
    #[test]
    fn cyclic_tags_and_wrong_checklist_parent_are_rejected() {
        let a = id();
        let b = id();
        let mut entities = BTreeMap::new();
        apply(&mut entities, &create(&a, "Tag4", json!({"tt":"A"}))).unwrap();
        apply(
            &mut entities,
            &create(&b, "Tag4", json!({"tt":"B","pn":[a]})),
        )
        .unwrap();
        assert!(validate(
            &entities,
            &json!({a.clone():{"e":"Tag4","t":1,"p":{"pn":[b]}}})
        )
        .is_err());
        assert!(validate(
            &entities,
            &create(&id(), "ChecklistItem3", json!({"tt":"Step","ts":[a]}))
        )
        .is_err());
    }
    #[test]
    fn authoritative_state_is_separate_from_optimistic_drafts_and_serializes_without_capability() {
        let task = id();
        let mut entities = BTreeMap::new();
        apply(
            &mut entities,
            &create(
                &task,
                "Task6",
                json!({"tt":"Cloud title","nt":note("New remote note")}),
            ),
        )
        .unwrap();
        let authoritative = Snapshot {
            entities: entities.clone(),
            head: 7,
            history: "PRIVATE-HISTORY".into(),
        };
        let changes = json!({task.clone():{"e":"Task6","t":1,"p":{"tt":"Local draft"}}});
        let pending = Pending {
            changes: changes.clone(),
            base: entities
                .iter()
                .map(|(k, v)| (k.clone(), Some(v.clone())))
                .collect(),
            status: "review".into(),
        };
        apply(&mut entities, &changes).unwrap();
        let workspace = Workspace {
            snapshot: Snapshot {
                entities,
                head: 7,
                history: "PRIVATE-HISTORY".into(),
            },
            authoritative: Some(authoritative),
            history_fingerprint: None,
            pending: vec![pending],
            last_sync: None,
        };
        let encoded = serde_json::to_string(&workspace).unwrap();
        assert!(!encoded.contains("PRIVATE-HISTORY"));
        let restored: Workspace = serde_json::from_str(&encoded).unwrap();
        assert_eq!(
            restored.authoritative.as_ref().unwrap().entities[&task].props["tt"],
            "Cloud title"
        );
        assert_eq!(restored.snapshot.entities[&task].props["tt"], "Local draft");
        assert_eq!(
            restored.authoritative.unwrap().entities[&task].props["nt"],
            note("New remote note")
        );
    }
    #[test]
    fn old_cache_without_authoritative_field_still_loads() {
        let restored: Workspace = serde_json::from_value(
            json!({"snapshot":{"entities":{},"head":0},"pending":[],"last_sync":null}),
        )
        .unwrap();
        assert!(restored.authoritative.is_none());
    }
}

//! Calendar recurrence and explicit copies; unsupported imported rules remain untouched.
use crate::cloud::Entity;
use chrono::{Datelike, Days, Months, NaiveDate};
use serde_json::{json, Value};
use std::collections::BTreeMap;
fn error() -> String {
    "This recurrence variant is not supported safely. Create or edit this series in Things; its existing rule has been preserved.".into()
}
fn date(value: i64) -> Result<NaiveDate, String> {
    if value % 86400 != 0 {
        return Err(error());
    }
    chrono::DateTime::from_timestamp(value, 0)
        .map(|d| d.date_naive())
        .ok_or_else(error)
}
fn stamp(date: NaiveDate) -> i64 {
    date.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp()
}
fn month_day(year: i32, month: u32, requested: i64) -> Result<NaiveDate, String> {
    let first = NaiveDate::from_ymd_opt(year, month, 1).ok_or_else(error)?;
    let last = first
        .checked_add_months(Months::new(1))
        .and_then(|d| d.pred_opt())
        .ok_or_else(error)?
        .day();
    let day = if requested == -1 {
        last
    } else {
        u32::try_from(requested + 1).map_err(|_| error())?.min(last)
    };
    first.with_day(day).ok_or_else(error)
}
pub(crate) fn next_date(rule: &Value, first: i64) -> Result<i64, String> {
    if rule["rrv"].as_i64() != Some(4)
        || ![0, 1].contains(&rule["tp"].as_i64().unwrap_or(0))
        || rule["rc"].as_i64().unwrap_or(0) != 0
        || rule["ts"].as_i64().unwrap_or(0) != 0
    {
        return Err(error());
    }
    if let Some(end) = rule.get("ed").filter(|v| !v.is_null()) {
        date(end.as_i64().ok_or_else(error)?)?;
    }
    let interval = rule["fa"]
        .as_u64()
        .filter(|v| (1..=1000).contains(v))
        .ok_or_else(error)?;
    let details = rule["of"]
        .as_array()
        .filter(|a| a.len() == 1)
        .ok_or_else(error)?;
    let detail = details[0].as_object().ok_or_else(error)?;
    let current = date(first)?;
    let after_completion = rule["tp"] == 1;
    let next = match rule["fu"].as_i64() {
        Some(16) => {
            if detail.keys().any(|k| k != "dy")
                || detail
                    .get("dy")
                    .and_then(Value::as_i64)
                    .is_some_and(|n| n != 0)
            {
                return Err(error());
            }
            current
                .checked_add_days(Days::new(interval))
                .ok_or_else(error)?
        }
        Some(256) => {
            let wd = detail
                .get("wd")
                .and_then(Value::as_u64)
                .filter(|v| *v <= 6)
                .ok_or_else(error)?;
            if detail.len() != 1
                || (!after_completion && wd != current.weekday().num_days_from_sunday() as u64)
            {
                return Err(error());
            }
            current
                .checked_add_days(Days::new(interval * 7))
                .ok_or_else(error)?
        }
        Some(8) => {
            let dy = detail
                .get("dy")
                .and_then(Value::as_i64)
                .filter(|n| (-1..=30).contains(n))
                .ok_or_else(error)?;
            if detail.len() != 1 {
                return Err(error());
            }
            let target = current
                .with_day(1)
                .unwrap()
                .checked_add_months(Months::new(interval as u32))
                .ok_or_else(error)?;
            month_day(
                target.year(),
                target.month(),
                if after_completion {
                    current.day() as i64 - 1
                } else {
                    dy
                },
            )?
        }
        Some(4) => {
            let dy = detail
                .get("dy")
                .and_then(Value::as_i64)
                .filter(|n| (0..=30).contains(n))
                .ok_or_else(error)?;
            let mo = detail
                .get("mo")
                .and_then(Value::as_u64)
                .filter(|n| *n <= 11)
                .ok_or_else(error)?;
            if detail.len() != 2 {
                return Err(error());
            }
            month_day(
                current
                    .year()
                    .checked_add(interval as i32)
                    .ok_or_else(error)?,
                if after_completion {
                    current.month()
                } else {
                    mo as u32 + 1
                },
                if after_completion {
                    current.day() as i64 - 1
                } else {
                    dy
                },
            )?
        }
        _ => return Err(error()),
    };
    if next <= current {
        return Err(error());
    }
    Ok(stamp(next))
}
fn following(rule: &Value, first: i64) -> Result<Option<i64>, String> {
    let next = next_date(rule, first)?;
    Ok((next <= rule["ed"].as_i64().unwrap_or(64092211200)).then_some(next))
}
pub(crate) fn normalize_creation(
    existing: &BTreeMap<String, Entity>,
    changes: &mut Value,
) -> Result<(), String> {
    let map = changes.as_object().ok_or("Invalid changes")?;
    let mut adjustments = Vec::new();
    for (id, event) in map {
        if event["t"] != 0 || !["Task6", "Task7"].iter().any(|kind| event["e"] == *kind) {
            continue;
        }
        if let Some(refs) = event["p"]["rt"].as_array() {
            for template_id in refs.iter().filter_map(Value::as_str) {
                if let Some(template) = existing.get(template_id) {
                    let first = template.props["sr"]
                        .as_i64()
                        .or_else(|| template.props["tir"].as_i64())
                        .ok_or_else(error)?;
                    next_date(&template.props["rr"], first)?;
                    if event["p"]["tir"].as_i64() != Some(first)
                        || !map.contains_key(template_id)
                        || template.props["icp"] == true
                        || template.props["tr"] == true
                    {
                        return Err("The repeating schedule changed. Reload it before creating another copy.".into());
                    }
                    if existing.values().any(|copy| {
                        copy.props["rt"]
                            .as_array()
                            .is_some_and(|ids| ids.iter().any(|id| id == template_id))
                            && copy.props["tir"].as_i64() == Some(first)
                    }) {
                        return Err("This repeating copy already exists.".into());
                    }
                }
            }
        }
        let rule = &event["p"]["rr"];
        if rule.is_null() {
            continue;
        }
        let instance = map
            .values()
            .find(|ev| {
                ev["p"]["rt"]
                    .as_array()
                    .is_some_and(|a| a.iter().any(|v| v.as_str() == Some(id)))
            })
            .ok_or("A repeating template and its first visible copy must be saved together")?;
        let first = instance["p"]["tir"]
            .as_i64()
            .or_else(|| instance["p"]["sr"].as_i64())
            .or_else(|| rule["ia"].as_i64())
            .ok_or_else(error)?;
        if first > rule["ed"].as_i64().unwrap_or(64092211200) {
            return Err("The repeat end date is before its first copy.".into());
        }
        let next = if rule["tp"] == 1 {
            next_date(rule, first)?;
            None
        } else {
            following(rule, first)?
        };
        adjustments.push((id.clone(), first, next));
    }
    for (id, first, next) in adjustments {
        let p = &mut changes[&id]["p"];
        p["sr"] = json!(next);
        p["tir"] = json!(next);
        p["icsd"] = json!(first);
        p["st"] = json!(1);
        p["sb"] = json!(0);
        p["rr"]["sr"] = json!(first);
    }
    Ok(())
}

fn available(
    entities: &BTreeMap<String, Entity>,
    id: &str,
    seen: &mut std::collections::BTreeSet<String>,
) -> bool {
    let Some(item) = entities.get(id) else {
        return false;
    };
    if !seen.insert(id.into())
        || item.props["tr"] == true
        || item.props["ss"].as_i64().unwrap_or(0) != 0
    {
        return false;
    }
    ["pr", "agr"].iter().all(|key| {
        item.props[*key].as_array().is_none_or(|ids| {
            ids.iter()
                .filter_map(Value::as_str)
                .all(|parent| available(entities, parent, &mut seen.clone()))
        })
    })
}

pub(crate) fn copy_changes(
    entities: &BTreeMap<String, Entity>,
    id: &str,
    today: i64,
) -> Result<Value, String> {
    let template = entities.get(id).ok_or("Repeating template not found")?;
    if !available(entities, id, &mut Default::default())
        || template.props["icp"] == true
        || template.props["rp"].is_string()
    {
        return Err(
            "This repeating schedule is paused, inactive, or uses an unsupported format.".into(),
        );
    }
    if template.props["tp"].as_i64().unwrap_or(0) != 0 {
        return Err(
            "Repeating project copies still need Things; the original project is preserved.".into(),
        );
    }
    let rule = &template.props["rr"];
    let first = template.props["sr"]
        .as_i64()
        .or_else(|| template.props["tir"].as_i64())
        .ok_or("This schedule is waiting for its current copy to be completed.")?;
    if first > rule["ed"].as_i64().unwrap_or(64092211200) {
        return Err("This repeating schedule has ended.".into());
    }
    let next = if rule["tp"] == 1 {
        next_date(rule, first)?;
        None
    } else {
        following(rule, first)?
    };
    let copy_id = crate::cloud::new_id();
    let mut props = template.props.clone();
    for (key, value) in [
        ("rr", Value::Null),
        ("rp", Value::Null),
        ("ss", json!(0)),
        ("sp", Value::Null),
        ("tr", json!(false)),
        ("rt", json!([id])),
        ("sr", json!(first)),
        ("tir", json!(first)),
        ("st", json!(if first > today { 2 } else { 1 })),
        ("icsd", Value::Null),
        ("icp", json!(false)),
        ("icc", json!(0)),
        ("acrd", Value::Null),
        (
            "cd",
            json!(chrono::Utc::now().timestamp_millis() as f64 / 1000.),
        ),
    ] {
        props[key] = value;
    }
    if let (Some(deadline), Some(anchor)) = (template.props["dd"].as_i64(), rule["ia"].as_i64()) {
        props["dd"] = json!(first + deadline - anchor);
    }
    let mut changes = json!({id: {"e": template.kind, "t": 1, "p": {"sr": next, "tir": next, "icsd": first, "icc": template.props["icc"].as_i64().unwrap_or(0) + 1}}, copy_id.clone(): {"e": template.kind, "t": 0, "p": props}});
    for check in entities.values().filter(|item| {
        item.kind == "ChecklistItem3"
            && item.props["ts"]
                .as_array()
                .is_some_and(|ids| ids.iter().any(|value| value == id))
    }) {
        let mut props = check.props.clone();
        props["ts"] = json!([copy_id]);
        props["ss"] = json!(0);
        props["sp"] = Value::Null;
        changes[crate::cloud::new_id()] = json!({"e": check.kind, "t": 0, "p": props});
    }
    let prepared = crate::store::prepare(changes)?;
    crate::store::validate(entities, &prepared)?;
    Ok(prepared)
}

pub(crate) fn completion_changes(
    existing: &BTreeMap<String, Entity>,
    changes: &mut Value,
) -> Result<(), String> {
    let mut updates = Vec::new();
    for (id, event) in changes.as_object().ok_or("Invalid changes")? {
        let Some(copy) = existing.get(id) else {
            continue;
        };
        if event["t"] != 1 || event["p"]["ss"] != 3 || copy.props["ss"].as_i64().unwrap_or(0) != 0 {
            continue;
        }
        for template_id in copy.props["rt"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
        {
            let Some(template) = existing.get(template_id) else {
                continue;
            };
            let rule = &template.props["rr"];
            if rule["tp"] != 1
                || template.props["icp"] == true
                || template.props["tr"] == true
                || template.props["rp"].is_string()
            {
                continue;
            }
            let completed = event["p"]["sp"]
                .as_f64()
                .unwrap_or(chrono::Utc::now().timestamp() as f64)
                as i64;
            let Some(completed) = chrono::DateTime::from_timestamp(completed, 0) else {
                continue;
            };
            let first = stamp(completed.with_timezone(&chrono::Local).date_naive());
            // An opaque imported rule must not block completion of its existing copy.
            if let Ok(next) = following(rule, first) {
                updates.push((template_id.to_string(), template.kind.clone(), next, first));
            }
        }
    }
    for (id, kind, next, completed) in updates {
        if changes[&id].is_null() {
            changes[&id] = json!({"e": kind, "t": 1, "p": {}});
        }
        let p = &mut changes[&id]["p"];
        if p.get("rr").is_none() {
            p["sr"] = json!(next);
            p["tir"] = json!(next);
            p["acrd"] = json!(completed);
        }
    }
    Ok(())
}

pub(crate) fn due_changes(entities: &BTreeMap<String, Entity>, today: i64) -> Value {
    let mut changes = json!({});
    for (id, template) in entities {
        let Some(first) = template.props["sr"]
            .as_i64()
            .or_else(|| template.props["tir"].as_i64())
        else {
            continue;
        };
        if template.props["rr"].is_null() || first > today {
            continue;
        }
        if template.props["rr"]["tp"] == 1
            && entities.values().any(|copy| {
                copy.props["rt"]
                    .as_array()
                    .is_some_and(|ids| ids.iter().any(|value| value == id))
                    && copy.props["ss"].as_i64().unwrap_or(0) == 0
                    && copy.props["tr"] != true
            })
        {
            continue;
        }
        if let Ok(copy) = copy_changes(entities, id, today) {
            changes
                .as_object_mut()
                .unwrap()
                .extend(copy.as_object().unwrap().clone());
        }
    }
    changes
}
#[cfg(test)]
mod tests {
    use super::*;
    fn rule(unit: i64, details: Value) -> Value {
        json!({"rrv":4,"tp":0,"rc":0,"ts":0,"ed":64092211200i64,"fu":unit,"fa":1,"of":[details]})
    }
    fn day(value: &str) -> i64 {
        stamp(NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap())
    }
    #[test]
    fn calendar_rules_preserve_month_end_and_leap_day() {
        assert_eq!(
            next_date(&rule(8, json!({"dy":30})), day("2024-01-31")).unwrap(),
            day("2024-02-29")
        );
        assert_eq!(
            next_date(&rule(8, json!({"dy":30})), day("2024-02-29")).unwrap(),
            day("2024-03-31")
        );
        assert_eq!(
            next_date(&rule(8, json!({"dy":-1})), day("2025-02-28")).unwrap(),
            day("2025-03-31")
        );
        assert_eq!(
            next_date(&rule(4, json!({"dy":28,"mo":1})), day("2024-02-29")).unwrap(),
            day("2025-02-28")
        );
    }
    #[test]
    fn unsupported_rules_are_rejected_not_approximated() {
        let mut r = rule(256, json!({"wd":1}));
        r["of"] = json!([{"wd":1},{"wd":3}]);
        assert!(next_date(&r, day("2026-10-26")).is_err());
        let mut r = rule(16, json!({}));
        r["tp"] = json!(2);
        assert!(next_date(&r, day("2026-10-26")).is_err());
        let mut r = rule(16, json!({}));
        r["rc"] = json!(5);
        assert!(next_date(&r, day("2026-10-26")).is_err());
    }
    #[test]
    fn initial_template_is_next_while_instance_remains_first() {
        let template = crate::cloud::new_id();
        let instance = crate::cloud::new_id();
        let first = day("2026-10-23");
        let mut changes = json!({template.clone():{"t":0,"e":"Task6","p":{"tt":"Repeat","rr":rule(16,json!({})),"sr":first,"tir":first}},instance.clone():{"t":0,"e":"Task6","p":{"tt":"Repeat","rt":[template],"sr":first,"tir":first}}});
        normalize_creation(&BTreeMap::new(), &mut changes).unwrap();
        assert_eq!(changes[&template]["p"]["sr"], first + 86400);
        assert_eq!(changes[&instance]["p"]["sr"], first);
        assert_eq!(changes[&template]["p"]["icsd"], first);
    }
    fn series(rule: Value, first: i64) -> (crate::store::Workspace, String, String) {
        let template = crate::cloud::new_id();
        let copy = crate::cloud::new_id();
        let changes = json!({template.clone(): {"e":"Task6","t":0,"p":{"tt":"Repeat","rr":rule,"sr":first,"tir":first}},copy.clone(): {"e":"Task6","t":0,"p":{"tt":"Repeat","rt":[template],"sr":first,"tir":first}}});
        (
            crate::workflow::mutate(&Default::default(), changes, false, false).unwrap(),
            template,
            copy,
        )
    }
    #[test]
    fn due_copies_catch_up_once_and_advance_the_template() {
        let first = day("2026-10-23");
        let (workspace, template, _) = series(rule(16, json!({})), first);
        let next = crate::workflow::materialize(&workspace, first + 3 * 86400, false).unwrap();
        assert_eq!(next.snapshot.entities.len(), 5);
        assert_eq!(
            next.snapshot.entities[&template].props["sr"],
            first + 4 * 86400
        );
        let again = crate::workflow::materialize(&next, first + 3 * 86400, false).unwrap();
        assert!(again.snapshot == next.snapshot);
        assert!(crate::workflow::mutate(
            &workspace,
            json!({template: {"e":"Task6","t":1,"p":{"ss":3}}}),
            false,
            false
        )
        .is_err());
    }
    #[test]
    fn after_completion_waits_and_uses_the_completion_day() {
        let first = day("2026-10-23");
        let mut rule = rule(16, json!({}));
        rule["tp"] = json!(1);
        rule["fa"] = json!(2);
        let (workspace, template, copy) = series(rule, first);
        assert!(workspace.snapshot.entities[&template].props["sr"].is_null());
        assert_eq!(
            crate::workflow::materialize(&workspace, first + 10 * 86400, false)
                .unwrap()
                .snapshot
                .entities
                .len(),
            2
        );
        let completed = crate::workflow::mutate(
            &workspace,
            json!({copy.clone():{"e":"Task6","t":1,"p":{"ss":3,"sp":first + 5 * 86400 + 43200}}}),
            false,
            false,
        )
        .unwrap();
        assert_eq!(
            completed.snapshot.entities[&template].props["sr"],
            first + 7 * 86400
        );
        let next = crate::workflow::materialize(&completed, first + 7 * 86400, false).unwrap();
        assert_eq!(next.snapshot.entities.len(), 3);
        assert!(next.snapshot.entities[&template].props["sr"].is_null());
    }
    #[test]
    fn end_dates_and_pause_prevent_further_copies() {
        let first = day("2026-10-23");
        let mut rule = rule(16, json!({}));
        rule["ed"] = json!(first + 86400);
        let (workspace, template, _) = series(rule, first);
        let ended = crate::workflow::materialize(&workspace, first + 5 * 86400, false).unwrap();
        assert_eq!(ended.snapshot.entities.len(), 3);
        assert!(ended.snapshot.entities[&template].props["sr"].is_null());
        let mut paused = workspace.clone();
        paused.snapshot.entities.get_mut(&template).unwrap().props["icp"] = json!(true);
        assert!(due_changes(&paused.snapshot.entities, first + 86400)
            .as_object()
            .unwrap()
            .is_empty());
    }
    #[test]
    fn copies_reset_checklists_and_preserve_unknown_fields() {
        let first = day("2026-10-23");
        let (mut workspace, template, _) = series(rule(16, json!({})), first);
        workspace
            .snapshot
            .entities
            .get_mut(&template)
            .unwrap()
            .props["xx"] = json!({"_t":"oo","sn":{"keep":true}});
        let check = crate::cloud::new_id();
        workspace.snapshot.entities.insert(
            check.clone(),
            Entity {
                id: check,
                kind: "ChecklistItem3".into(),
                props: json!({"tt":"Step","ts":[template],"ss":3,"sp":first}),
            },
        );
        let changes = copy_changes(&workspace.snapshot.entities, &template, first).unwrap();
        let next = crate::workflow::mutate(&workspace, changes, false, false).unwrap();
        let copy = next
            .snapshot
            .entities
            .values()
            .find(|e| !workspace.snapshot.entities.contains_key(&e.id) && e.kind == "Task6")
            .unwrap();
        assert_eq!(copy.props["xx"]["sn"]["keep"], true);
        let check = next
            .snapshot
            .entities
            .values()
            .find(|e| e.kind == "ChecklistItem3" && e.props["ts"][0] == copy.id)
            .unwrap();
        assert_eq!(check.props["ss"], 0);
        assert!(check.props["sp"].is_null());
    }
}

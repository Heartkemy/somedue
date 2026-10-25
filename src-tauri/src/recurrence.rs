//! Conservative recurring creation. Existing series are never silently rescheduled or cloned.
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
        || rule["tp"].as_i64().unwrap_or(0) != 0
        || rule["rc"].as_i64().unwrap_or(0) != 0
        || rule["ts"].as_i64().unwrap_or(0) != 0
    {
        return Err(error());
    }
    if rule
        .get("ed")
        .and_then(Value::as_i64)
        .is_some_and(|end| end != 64092211200)
    {
        return Err(error());
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
            if detail.len() != 1 || wd != current.weekday().num_days_from_sunday() as u64 {
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
            month_day(target.year(), target.month(), dy)?
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
                mo as u32 + 1,
                dy,
            )?
        }
        _ => return Err(error()),
    };
    if next <= current {
        return Err(error());
    }
    Ok(stamp(next))
}
pub(crate) fn normalize_creation(
    existing: &BTreeMap<String, Entity>,
    changes: &mut Value,
) -> Result<(), String> {
    let map = changes.as_object().ok_or("Invalid changes")?;
    let mut adjustments = Vec::new();
    for (id, event) in map {
        if event["t"] != 0 || event["e"] != "Task6" {
            continue;
        }
        if let Some(refs) = event["p"]["rt"].as_array() {
            if refs
                .iter()
                .filter_map(Value::as_str)
                .any(|id| existing.contains_key(id))
            {
                return Err("Future copies of an existing repeating series are materialized by Things. This client preserves the original template instead of synthesizing a potentially incompatible copy.".into());
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
        let next = next_date(rule, first)?;
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
        r["tp"] = json!(1);
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
}

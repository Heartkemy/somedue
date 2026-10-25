import { day, date, nextDate, today, type Props } from "./model";

export const neverEnds = 64092211200;
export const repeatUnits: Record<number, string> = {
  16: "days",
  256: "weeks",
  8: "months",
  4: "years",
};
export function makeRule(
  unit: number,
  interval: number,
  first: string,
  afterCompletion = false,
  end = "",
): Props {
  const start = day(first),
    d = new Date(start * 1000);
  if (
    !Number.isFinite(start) ||
    date(start) !== first ||
    !Number.isInteger(interval) ||
    interval < 1 ||
    interval > 1000 ||
    !repeatUnits[unit]
  )
    throw Error("Choose a valid date and an interval from 1 to 1000.");
  if (
    end &&
    (!Number.isFinite(day(end)) || date(day(end)) !== end || day(end) < start)
  )
    throw Error("The end date must be on or after the next copy.");
  const detail =
    unit === 256
      ? { wd: d.getUTCDay() }
      : unit === 8
        ? { dy: d.getUTCDate() - 1 }
        : unit === 4
          ? { dy: d.getUTCDate() - 1, mo: d.getUTCMonth() }
          : {};
  return {
    rrv: 4,
    tp: afterCompletion ? 1 : 0,
    fu: unit,
    fa: interval,
    of: [detail],
    ia: start,
    sr: start,
    ed: end ? day(end) : neverEnds,
    rc: 0,
    ts: 0,
  };
}
export function simpleRule(rule: Props) {
  if (
    rule.rrv !== 4 ||
    ![0, 1].includes(rule.tp ?? 0) ||
    !repeatUnits[rule.fu] ||
    !Number.isInteger(rule.fa) ||
    rule.fa < 1 ||
    rule.fa > 1000 ||
    rule.rc ||
    rule.ts ||
    rule.of?.length !== 1
  )
    return false;
  const detail = rule.of[0];
  if (!detail || typeof detail !== "object") return false;
  const keys =
    rule.fu === 16
      ? ["dy"]
      : rule.fu === 256
        ? ["wd"]
        : rule.fu === 8
          ? ["dy"]
          : ["dy", "mo"];
  if (Object.keys(detail).some((key) => !keys.includes(key))) return false;
  if (rule.fu === 16) return detail.dy === undefined || detail.dy === 0;
  if (rule.fu === 256)
    return Number.isInteger(detail.wd) && detail.wd >= 0 && detail.wd <= 6;
  return (
    Number.isInteger(detail.dy) &&
    detail.dy >= (rule.fu === 8 ? -1 : 0) &&
    detail.dy <= 30 &&
    (rule.fu !== 4 ||
      (Number.isInteger(detail.mo) && detail.mo >= 0 && detail.mo <= 11))
  );
}
export function ruleSummary(rule: Props) {
  if (!rule) return "Repeating to-do";
  const label =
    rule.fa === 1
      ? (
          { 16: "daily", 256: "weekly", 8: "monthly", 4: "yearly" } as Record<
            number,
            string
          >
        )[rule.fu]
      : `every ${rule.fa} ${repeatUnits[rule.fu] || "periods"}`;
  return `Repeat ${label || "on a custom schedule"}${rule.tp === 1 ? " after completion" : ""}`;
}
export function ruleDates(
  rule: Props,
  first = rule.ia || today(),
  count = 3,
): number[] {
  if (!simpleRule(rule)) return [];
  const result: number[] = [];
  let current = first;
  for (let i = 0; i < count && current <= (rule.ed || neverEnds); i++) {
    result.push(current);
    const next = nextDate(current, rule.fu, rule.fa);
    if (rule.tp === 0 && [8, 4].includes(rule.fu)) {
      const d = new Date(next * 1000),
        detail = rule.of[0];
      if (rule.fu === 4) d.setUTCMonth(detail.mo, 1);
      const last = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      ).getUTCDate();
      d.setUTCDate(detail.dy === -1 ? last : Math.min(detail.dy + 1, last));
      current = d.getTime() / 1000;
    } else current = next;
  }
  return result;
}

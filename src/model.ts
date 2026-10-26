export type Props = Record<string, any>;
export type Entity = { id: string; kind: string; props: Props };
export type State = {
  entities: Entity[];
  account: string;
  cloudAvailable?: boolean;
  pending: number;
  blocked: boolean;
  lastSync: string | null;
  preferences: Props;
  shortcutError?: string | null;
};
export type Event = { e: string; t: 0 | 1 | 2; p: Props };
export type Changes = Record<string, Event>;
export const lists = [
  "Inbox",
  "Today",
  "Upcoming",
  "Anytime",
  "Someday",
  "Logbook",
  "Trash",
] as const;
export const title = (e: Entity) =>
  e.props.tt ||
  (e.kind.startsWith("Task")
    ? e.props.tp === 1
      ? "New Project"
      : e.props.tp === 2
        ? "New Heading"
        : "New To-Do"
    : "Untitled");
export const isTask = (e: Entity) => e.kind.startsWith("Task");
export const isProject = (e: Entity) => isTask(e) && e.props.tp === 1;
export const isHeading = (e: Entity) => isTask(e) && e.props.tp === 2;
export const isTemplate = (e: Entity) => !!e.props.rr;
export const refs = (e: Entity, k: string): string[] => e.props[k] || [];
const indexes = new WeakMap<Entity[], ReturnType<typeof buildIndex>>();
function buildIndex(all: Entity[]) {
  const byId = new Map(
    all.map((item, position) => [item.id, { item, position }]),
  );
  const children = new Map<string, Map<string, Entity[]>>();
  for (const key of ["pr", "agr", "ts"]) {
    const groups = new Map<string, Entity[]>();
    for (const item of all)
      for (const id of refs(item, key)) {
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id)!.push(item);
      }
    children.set(key, groups);
  }
  return { byId, children };
}
function entityIndex(all: Entity[]) {
  // State updates replace the entity array; weak keys release old snapshot indexes.
  let index = indexes.get(all);
  if (!index) indexes.set(all, (index = buildIndex(all)));
  return index;
}
export const entityById = (all: Entity[], id: string) =>
  entityIndex(all).byId.get(id)?.item;
export const related = (all: Entity[], key: "pr" | "agr" | "ts", id: string) =>
  entityIndex(all).children.get(key)?.get(id) || [];
function firstReference(all: Entity[], ids: string[]) {
  const index = entityIndex(all);
  return ids
    .map((id) => index.byId.get(id))
    .filter((entry) => !!entry)
    .sort((a, b) => a.position - b.position)[0]?.item;
}
export const trashed = (e: Entity) => !!e.props.tr;
export const day = (s: string) =>
  Math.floor(Date.parse(`${s}T00:00:00Z`) / 1000);
export const date = (n?: number | null) =>
  n ? new Date(n * 1000).toISOString().slice(0, 10) : "";
export function today() {
  const d = new Date();
  return day(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
  );
}
export const noteText = (e: Entity) =>
  typeof e.props.nt === "string" ? e.props.nt : e.props.nt?.v || "";
export function uuid() {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let n = BigInt(
    "0x" + Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join(""),
  );
  let s = "";
  while (n) {
    s = alphabet[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = "1" + s;
  }
  return s;
}
export function active(
  e: Entity,
  all: Entity[],
  seen = new Set<string>(),
): boolean {
  if (trashed(e) || e.props.ss || seen.has(e.id)) return false;
  seen.add(e.id);
  return [...refs(e, "pr"), ...refs(e, "agr")].every((id) => {
    const parent = entityById(all, id);
    return !!parent && active(parent, all, new Set(seen));
  });
}
export function inTrash(
  e: Entity,
  all: Entity[],
  seen = new Set<string>(),
): boolean {
  if (trashed(e)) return true;
  if (seen.has(e.id)) return false;
  seen.add(e.id);
  return [...refs(e, "pr"), ...refs(e, "agr")].some((id) => {
    const parent = entityById(all, id);
    return !!parent && inTrash(parent, all, seen);
  });
}
export function effectiveTags(entity: Entity, all: Entity[]): Set<string> {
  const found = new Set<string>(),
    visited = new Set<string>();
  const addTag = (id: string) => {
    if (found.has(id)) return;
    found.add(id);
    const tag = entityById(all, id);
    if (tag) for (const parent of refs(tag, "pn")) addTag(parent);
  };
  const walk = (item: Entity) => {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    for (const id of refs(item, "tg")) addTag(id);
    for (const id of [
      ...refs(item, "pr"),
      ...refs(item, "ar"),
      ...refs(item, "agr"),
    ]) {
      const parent = entityById(all, id);
      if (parent) walk(parent);
    }
  };
  walk(entity);
  return found;
}
export function visible(
  all: Entity[],
  list: string,
  query = "",
  tag = "",
  showLogged = false,
): Entity[] {
  const now = today();
  const scoped = !lists.includes(list as any);
  const parents =
    showLogged && scoped
      ? all.map((p) =>
          p.id === list ? { ...p, props: { ...p.props, ss: 0 } } : p,
        )
      : all;
  const search = query.toLowerCase();
  const rows = all
    .filter((e) => {
      if (!isTask(e)) return false;
      if (tag && !effectiveTags(e, all).has(tag)) return false;
      if (!query && list === "Trash") return inTrash(e, all);
      if (isTemplate(e) && !["Upcoming", "Repeating", "Trash"].includes(list))
        return false;
      if (query)
        return query.startsWith("#")
          ? [...effectiveTags(e, all)].some((id) => {
              const tag = entityById(all, id);
              return (
                !!tag && title(tag).toLowerCase().includes(search.slice(1))
              );
            })
          : `${title(e)} ${noteText(e)}`.toLowerCase().includes(search);
      if (list === "Logbook")
        return !!e.props.ss && !inTrash(e, all) && !isHeading(e);
      if (
        !active(
          showLogged && scoped ? { ...e, props: { ...e.props, ss: 0 } } : e,
          parents,
        )
      )
        return false;
      const start = e.props.sr || e.props.tir;
      switch (list) {
        case "Inbox":
          return !e.props.st && !isHeading(e);
        case "Today":
          return (
            !isHeading(e) &&
            ((start && start <= now) || (e.props.dd && e.props.dd <= now))
          );
        case "Upcoming":
          return !isHeading(e) && !e.props.icp && !!upcomingDay(e);
        case "Anytime":
          return (
            !isHeading(e) &&
            (e.props.st === 1 || (e.props.st === 2 && start && start <= now)) &&
            (!start || start <= now)
          );
        case "Someday":
          return !isHeading(e) && e.props.st === 2 && !start;
        case "Repeating":
          return isTemplate(e) || !!e.props.rt?.length;
        case "Deadlines":
          return !!e.props.dd;
        default:
          return (
            refs(e, "pr").includes(list) ||
            refs(e, "ar").includes(list) ||
            refs(e, "agr").some(
              (id) =>
                !!entityById(all, id) &&
                refs(entityById(all, id)!, "pr").includes(list),
            )
          );
      }
    })
    .sort(
      (a, b) =>
        (showLogged && !lists.includes(list as any)
          ? Number(!!a.props.ss) - Number(!!b.props.ss)
          : 0) ||
        (!lists.includes(list as any)
          ? scheduleBucket(a) - scheduleBucket(b)
          : 0) ||
        (list === "Upcoming"
          ? upcomingDay(a) - upcomingDay(b)
          : list === "Trash"
            ? (b.props.md || b.props.cd || 0) -
                (a.props.md || a.props.cd || 0) ||
              (a.props.ix || 0) - (b.props.ix || 0) ||
              a.id.localeCompare(b.id)
            : list === "Logbook"
              ? (b.props.sp || 0) - (a.props.sp || 0)
              : (list === "Today"
                  ? (a.props.sb || 0) - (b.props.sb || 0)
                  : 0) ||
                (list === "Today"
                  ? (a.props.ti ?? a.props.ix ?? 0) -
                    (b.props.ti ?? b.props.ix ?? 0)
                  : (a.props.ix || 0) - (b.props.ix || 0)) ||
                a.id.localeCompare(b.id)),
    );
  const target = entityById(all, list);
  if (target && isProject(target) && !query) {
    const logged = rows.filter((e) => !!e.props.ss);
    const pending = rows.filter((e) => !e.props.ss);
    const headings = pending.filter(isHeading);
    const headingIds = new Set(headings.map((heading) => heading.id));
    const children = new Map<string, Entity[]>();
    for (const item of pending)
      for (const id of refs(item, "agr")) {
        if (!headingIds.has(id)) continue;
        if (!children.has(id)) children.set(id, []);
        children.get(id)!.push(item);
      }
    const loose = pending.filter(
      (e) => !isHeading(e) && !refs(e, "agr").some((id) => headingIds.has(id)),
    );
    return [
      ...loose,
      ...headings.flatMap((h) => [h, ...(children.get(h.id) || [])]),
      ...logged,
    ];
  }
  if (target?.kind.startsWith("Area") && !query)
    return [
      ...rows.filter((e) => isProject(e) && !e.props.ss),
      ...rows.filter((e) => !isProject(e) && !e.props.ss),
      ...rows.filter((e) => !!e.props.ss),
    ];
  return rows;
}
export function upcomingDay(item: Entity) {
  const days = [item.props.sr || item.props.tir, item.props.dd].filter(
    (value) => value && value > today(),
  );
  return days.length ? Math.min(...days) : 0;
}

export function taskContainer(item: Entity, all: Entity[]): Entity | undefined {
  const heading = firstReference(all, refs(item, "agr"));
  return firstReference(all, [
    ...refs(item, "pr"),
    ...(heading ? refs(heading, "pr") : []),
    ...refs(item, "ar"),
  ]);
}

export type ListSection = {
  id: string;
  label: string;
  rows: Entity[];
  container?: Entity;
  day?: number;
};
export function listSections(
  rows: Entity[],
  all: Entity[],
  list: string,
  calendar = true,
): ListSection[] {
  if (list === "Upcoming") {
    const groups = new Map<number, Entity[]>();
    for (const item of rows) {
      const day = upcomingDay(item);
      if (!day) continue;
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(item);
    }
    const dates = new Set(groups.keys());
    if (calendar)
      for (let offset = 1; offset <= 30; offset++)
        dates.add(today() + offset * 86400);
    return [...dates]
      .sort((a, b) => a - b)
      .map((day) => ({
        id: String(day),
        label: "",
        day,
        rows: groups.get(day) || [],
      }));
  }
  if (list === "Anytime") {
    const groups = new Map<string, ListSection>();
    for (const item of rows.filter((item) => !isProject(item))) {
      const parent = taskContainer(item, all);
      const id = parent?.id || "no-project";
      if (!groups.has(id))
        groups.set(id, {
          id,
          label: parent ? title(parent) : "No Project",
          container: parent,
          rows: [],
        });
      groups.get(id)!.rows.push(item);
    }
    return [...groups.values()].sort(
      (a, b) => (a.container?.props.ix || 0) - (b.container?.props.ix || 0),
    );
  }
  return [{ id: list, label: "", rows }];
}
export const later = (e: Entity) =>
  (e.props.st === 2 && !(e.props.sr || e.props.tir)) ||
  (e.props.sr || e.props.tir || 0) > today();
export const scheduleBucket = (e: Entity) =>
  !later(e) ? 0 : e.props.sr || e.props.tir ? 1 : 2;
export function projectProgressPath(ratio: number) {
  const progress = Math.max(0, Math.min(1, ratio));
  if (!progress) return "";
  if (progress === 1)
    return "M10 4.5 A5.5 5.5 0 1 1 10 15.5 A5.5 5.5 0 1 1 10 4.5 Z";
  const angle = progress * Math.PI * 2;
  return `M10 10 L10 4.5 A5.5 5.5 0 ${progress > 0.5 ? 1 : 0} 1 ${10 + Math.sin(angle) * 5.5} ${10 - Math.cos(angle) * 5.5} Z`;
}
export function projectStats(project: Entity, all: Entity[]) {
  const direct = related(all, "pr", project.id);
  const tasks = [
    ...new Map(
      [
        ...direct,
        ...direct
          .filter(isHeading)
          .flatMap((heading) => related(all, "agr", heading.id)),
      ].map((item) => [item.id, item]),
    ).values(),
  ].filter(
    (e) =>
      isTask(e) &&
      !isProject(e) &&
      !isHeading(e) &&
      !trashed(e) &&
      !isTemplate(e),
  );
  return {
    total: tasks.length,
    done: tasks.filter((e) => !!e.props.ss).length,
    remaining: tasks.filter((e) => !e.props.ss).length,
  };
}
export function orderBefore(
  rows: Entity[],
  moved: Entity,
  target: Entity,
  after = false,
  field = "ix",
): Changes {
  if (
    moved.id === target.id ||
    !rows.some((e) => e.id === moved.id) ||
    !rows.some((e) => e.id === target.id)
  )
    return {};
  const ordered = rows.filter((e) => e.id !== moved.id);
  ordered.splice(
    ordered.findIndex((e) => e.id === target.id) + Number(after),
    0,
    moved,
  );
  return Object.assign(
    {},
    ...ordered.map((e, i) => event(e, { [field]: i * 1024 })),
  );
}
export function event(e: Entity, p: Props): Changes {
  return { [e.id]: { e: e.kind, t: 1, p } };
}
export function create(kind: string, p: Props): Changes {
  return {
    [uuid()]: {
      e: kind,
      t: 0,
      p: {
        tt: "",
        ix: Date.now(),
        cd: Date.now() / 1000,
        ...(["Task6", "Task7"].includes(kind)
          ? { tp: 0, st: 0, ss: 0, tr: false }
          : {}),
        ...p,
      },
    },
  };
}
export function schedule(mode: string, d = ""): Props {
  if (mode === "Inbox") return { st: 0, sr: null, tir: null, sb: 0 };
  if (mode === "Someday") return { st: 2, sr: null, tir: null, sb: 0 };
  if (mode === "Anytime") return { st: 1, sr: null, tir: null, sb: 0 };
  const n = mode === "Date" ? day(d) : today();
  return {
    st: n > today() ? 2 : 1,
    sr: n,
    tir: n,
    sb: mode === "This Evening" ? 1 : 0,
  };
}
export function container(e: Entity, all: Entity[]) {
  return [...refs(e, "pr"), ...refs(e, "ar")]
    .map((id) => entityById(all, id))
    .filter(Boolean)
    .map((x) => title(x!))
    .join(" / ");
}
export function move(_e: Entity, target: Entity | null): Props {
  if (!target) return { pr: [], ar: [], agr: [], st: 0 };
  if (isHeading(target))
    return { pr: target.props.pr || [], ar: [], agr: [target.id], st: 1 };
  return {
    pr: isProject(target) ? [target.id] : [],
    ar: target.kind.startsWith("Area") ? [target.id] : [],
    agr: [],
    st: 1,
  };
}
export function nextDate(start: number, unit: number, interval = 1) {
  const d = new Date(start * 1000);
  if (unit === 16) d.setUTCDate(d.getUTCDate() + interval);
  else if (unit === 256) d.setUTCDate(d.getUTCDate() + interval * 7);
  else if (unit === 8) {
    const target = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + interval);
    const last = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(target, last));
  } else if (unit === 4) {
    const month = d.getUTCMonth();
    d.setUTCFullYear(d.getUTCFullYear() + interval);
    if (d.getUTCMonth() !== month) d.setUTCDate(0);
  } else
    throw Error(
      "This recurrence rule requires Things to create its next copy.",
    );
  return d.getTime() / 1000;
}

export function descendants(root: Entity, all: Entity[]): Entity[] {
  const result = [root];
  const seen = new Set([root.id]);
  for (let i = 0; i < result.length; i++) {
    for (const child of all) {
      if (
        !seen.has(child.id) &&
        ["pr", "agr", "ts"].some((k) => refs(child, k).includes(result[i].id))
      ) {
        seen.add(child.id);
        result.push(child);
      }
    }
  }
  return result;
}
export function deleteTree(root: Entity, all: Entity[]): Changes {
  return Object.fromEntries(
    descendants(root, all).map((e) => [e.id, { e: e.kind, t: 2, p: {} }]),
  );
}
export function duplicateTree(
  root: Entity,
  all: Entity[],
): { changes: Changes; id: string } {
  const originals = descendants(root, all);
  if (originals.some((e) => refs(e, "rt").length || e.props.rr))
    throw Error("Repeating items cannot be duplicated.");
  const ids = new Map(originals.map((e) => [e.id, uuid()]));
  const changes: Changes = {};
  for (const item of originals) {
    const p: Props = {
      ...item.props,
      tt: title(item) + (item.id === root.id ? " copy" : ""),
      ss: 0,
      sp: null,
      tr: false,
      cd: Date.now() / 1000,
    };
    for (const k of ["pr", "agr", "ts"])
      p[k] = refs(item, k).map((id) => ids.get(id) || id);
    if (item.id === root.id) p.ix = Date.now();
    changes[ids.get(item.id)!] = { e: item.kind, t: 0, p };
  }
  return { changes, id: ids.get(root.id)! };
}

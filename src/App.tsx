import { Input, Textarea, Kbd } from "./ui";
import {
  createSignal,
  createMemo,
  createEffect,
  on,
  For,
  Show,
  onMount,
  onCleanup,
  batch,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { Dynamic, Portal } from "solid-js/web";
import TagPicker from "./TagPicker";
import DatePicker from "./DatePicker";
import { Popover } from "./Popover";
import { listen } from "@tauri-apps/api/event";
import {
  Inbox,
  Star,
  CalendarDays,
  Layers,
  Archive,
  BookOpen,
  Trash2,
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  Check,
  Flag,
  RotateCw,
  MoreHorizontal,
  RefreshCw,
  Pause,
  Play,
  Folder,
  X,
  Box,
  ArrowRight,
  ListChecks,
  FileText,
  GripHorizontal,
} from "lucide-solid";
import TaskRow from "./TaskRow";
import SettingsPage from "./SettingsPage";
import TaskMenu, { type TaskAction } from "./TaskMenu";
import {
  AreaIcon,
  EveningIcon,
  SettingsIcon,
  isSomeday,
  ProjectProgress as ProjectProgressIcon,
  ListIcon,
  EntityIcon,
} from "./TaskIndicators";
import { selectListItems } from "./list-selection";
import {
  Select,
  Button,
  IconButton,
  Checkbox,
  CheckButton,
  Pill,
  ActionBar,
  Dialog,
  Field,
  ListHeading,
  NavigationItem,
  UnderlineTab,
  FeedbackContext,
  Menu,
  MenuItem,
  MenuPopup,
} from "./ui";
import CloudConnection from "./CloudConnection";
import { call, native } from "./api";
import {
  type State,
  type Entity,
  type Props,
  type Changes,
  lists,
  title,
  isProject,
  isTask,
  isHeading,
  isTemplate,
  refs,
  trashed,
  active,
  visible,
  event,
  create,
  schedule,
  container,
  today,
  date,
  day,
  noteText,
  move,
  duplicateTree,
  deleteTree,
  uuid,
  later,
  orderBefore,
  scheduleBucket,
  effectiveTags,
  inTrash,
  listSections,
} from "./model";
import Markdown from "./Markdown";
import { installMotion } from "./motion";
import { createEditorSaves, type EditorSession } from "./editor-saves";
import DestinationPicker from "./DestinationPicker";
import RepeatRuleDialog, { type RepeatOptions } from "./RepeatRuleDialog";
import { ruleDates, ruleSummary, simpleRule } from "./recurrence";
type CheckRow = { id: string; kind: string; title: string; done: boolean };
type EditorDraft =
  | { heading: true; name: string }
  | {
      heading: false;
      name: string;
      notes: string;
      start: string;
      mode: string;
      deadline: string;
      reminder: string;
      tags: string[];
      repeatRule: Props | null;
      repeatNext: string;
      repeatOptions: RepeatOptions;
      repeatOpen: boolean;
      repeatId: string;
      checks: CheckRow[];
      status: number;
      destination: string;
      convert: boolean;
    };
const navIcons = [Inbox, Star, CalendarDays, Layers, Archive, BookOpen, Trash2];
const initial: State = {
  entities: [],
  account: "local",
  pending: 0,
  blocked: false,
  lastSync: null,
  preferences: {},
};
export default function App() {
  const [state, setRawState] = createSignal<State>(initial),
    [list, setList] = createSignal<string>("Inbox"),
    [selected, setFocused] = createSignal(""),
    [selection, setSelection] = createSignal<string[]>([]),
    [taskMenu, setTaskMenu] = createSignal<{ x: number; y: number } | null>(
      null,
    ),
    [batchEdit, setBatchEdit] = createSignal<
      "when" | "deadline" | "tags" | null
    >(null),
    [infoItem, setInfoItem] = createSignal<Entity | null>(null),
    [newTasks, setNewTasks] = createSignal<string[]>([]),
    [newToday, setNewToday] = createSignal<string[]>([]),
    [upcomingCalendar, setUpcomingCalendar] = createSignal(true),
    [expandedGroups, setExpandedGroups] = createSignal<string[]>([]),
    [editing, setEditing] = createSignal(""),
    [draft, setDraft] = createSignal<Entity | null>(null),
    [query, setQuery] = createSignal(""),
    [tag, setTag] = createSignal(""),
    [settings, setSettings] = createSignal(false),
    [connectionOpen, setConnectionOpen] = createSignal(false),
    [settingsTab, setSettingsTab] = createSignal("General"),
    [creating, setCreating] = createSignal<string | null>(null),
    [menu, setMenu] = createSignal(false),
    [moving, setMoving] = createSignal(false),
    [error, setError] = createSignal(""),
    [notice, setNotice] = createSignal(""),
    [busy, setBusy] = createSignal(false),
    [loading, setLoading] = createSignal(true),
    [collapsed, setCollapsed] = createSignal<string[]>([]),
    [sidebar, setSidebar] = createSignal(true),
    [showLater, setShowLater] = createSignal(true),
    [showLogged, setShowLogged] = createSignal(false),
    [dragging, setDragging] = createSignal(""),
    [dropTarget, setDropTarget] = createSignal<{
      id: string;
      after: boolean;
    } | null>(null),
    [findOpen, setFindOpen] = createSignal(false),
    [findQuery, setFindQuery] = createSignal(""),
    [findIndex, setFindIndex] = createSignal(0),
    [recentItems, setRecentItems] = createSignal<string[]>(["Today", "Inbox"]),
    [editorActions, setEditorActions] = createSignal<{
      move: () => void;
      more: () => void;
      action: (action: TaskAction) => void;
    } | null>(null),
    [sidebarWidth, setSidebarWidth] = createSignal(236),
    [confirming, setConfirming] = createSignal(false),
    [confirm, setConfirm] = createSignal<{
      text: string;
      action: () => Promise<void>;
    } | null>(null),
    [undo, setUndo] = createSignal<Changes | null>(null);
  let selectionAnchor = "";
  function setSelected(id: string) {
    batch(() => {
      setFocused(id);
      setSelection(id ? [id] : []);
    });
    selectionAnchor = id;
  }
  function selectItem(item: Entity, e: MouseEvent | KeyboardEvent) {
    const ids = selectListItems(
      items().map((row) => row.id),
      selection(),
      selectionAnchor,
      item.id,
      { toggle: e.metaKey || e.ctrlKey, range: e.shiftKey },
    );
    batch(() => {
      setSelection(ids);
      setFocused(ids.includes(item.id) ? item.id : ids.at(-1) || "");
    });
    if (!e.shiftKey) selectionAnchor = item.id;
  }
  const selectedItems = () =>
    items().filter((item) => selection().includes(item.id));
  async function patchSelection(p: Props | ((item: Entity) => Props)) {
    const changes = Object.assign(
      {},
      ...selectedItems().map((item) =>
        event(item, typeof p === "function" ? p(item) : p),
      ),
    );
    if (Object.keys(changes).length) await run(() => mutate(changes));
  }
  async function completeSelection(cancel = false) {
    const reopen = selectedItems().every((item) => !!item.props.ss);
    const changes = Object.assign(
      {},
      ...selectedItems()
        .filter((item) => !isTemplate(item))
        .map((item) =>
          event(item, {
            ss: reopen ? 0 : cancel ? 2 : 3,
            sp: reopen ? null : Date.now() / 1000,
          }),
        ),
    );
    if (Object.keys(changes).length) await run(() => mutate(changes));
  }
  async function removeSelection() {
    if (selectedItems().some(isTemplate)) {
      const changes = Object.assign(
        {},
        ...selectedItems().map((item) => event(item, { tr: true })),
      );
      ask(
        "Move these repeating schedules to Trash? Future copies will stop; existing copies stay in your lists.",
        async () => {
          await mutate(changes, true);
          setSelected("");
        },
      );
      return;
    }
    await patchSelection({ tr: true });
    setSelected("");
  }
  function openTaskMenu(item: Entity, e?: MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (isHeading(item)) {
      setEditing(item.id);
      queueMicrotask(() =>
        document
          .querySelector<HTMLButtonElement>('[aria-label="Heading actions"]')
          ?.click(),
      );
      return;
    }
    if (!selection().includes(item.id)) setSelected(item.id);
    const row = document
      .getElementById(`item-${item.id}`)
      ?.getBoundingClientRect();
    setTaskMenu({
      x: e?.clientX ?? row?.right ?? 300,
      y: e?.clientY ?? row?.bottom ?? 200,
    });
  }
  function closeTaskMenu() {
    setTaskMenu(null);
    document
      .getElementById(`item-${selected()}`)
      ?.focus({ preventScroll: true });
  }
  function applyIncoming(next: State) {
    const known = new Set(all().map((item) => item.id));
    setNewTasks((ids) => [
      ...new Set([
        ...ids,
        ...next.entities
          .filter(
            (item) =>
              !known.has(item.id) &&
              isTask(item) &&
              !isProject(item) &&
              !isHeading(item) &&
              !isTemplate(item) &&
              active(item, next.entities),
          )
          .map((item) => item.id),
      ]),
    ]);
    setState(next);
  }
  function taskAction(action: TaskAction) {
    const item = chosen();
    if (!item) return;
    const modes = {
      today: "Today",
      evening: "This Evening",
      anytime: "Anytime",
      someday: "Someday",
    };
    if (action in modes) {
      void patchSelection(schedule(modes[action as keyof typeof modes]));
      return;
    }
    if (
      ["when", "deadline", "tags"].includes(action) &&
      selection().length > 1
    ) {
      setBatchEdit(action as "when" | "deadline" | "tags");
      return;
    }
    if (action === "move") {
      setMoving(true);
      return;
    }
    if (action === "delete") {
      void removeSelection();
      return;
    }
    if (["complete", "cancel", "reopen"].includes(action)) {
      const changes = Object.assign(
        {},
        ...selectedItems()
          .filter((item) => !isTemplate(item))
          .map((item) =>
            event(item, {
              ss: action === "complete" ? 3 : action === "cancel" ? 2 : 0,
              sp: action === "reopen" ? null : Date.now() / 1000,
            }),
          ),
      );
      if (Object.keys(changes).length) void run(() => mutate(changes));
      return;
    }
    if (action === "info") {
      setInfoItem(item);
      return;
    }
    if (action === "duplicate") {
      void run(() => duplicate(item));
      return;
    }
    if (action === "removeProject") {
      void patchSelection({ pr: [], agr: [] });
      return;
    }
    if (action === "showProject") {
      const project = refs(item, "pr")[0];
      if (project) navigate(project);
      return;
    }
    if (action === "share") {
      void shareTask(title(item), noteText(item));
      return;
    }
    setEditing(item.id);
    queueMicrotask(() => editorActions()?.action(action));
  }
  async function shareTask(name: string, notes: string) {
    await run(async () => {
      const text = [name, notes].filter(Boolean).join("\n\n");
      if (navigator.share) await navigator.share({ title: name, text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Copied to clipboard");
      }
    });
  }
  const [editorFooter, setEditorFooter] = createSignal<HTMLDivElement>();
  function setState(input: State | ((previous: State) => State)) {
    setRawState((previous) => {
      const next = typeof input === "function" ? input(previous) : input;
      if (!loading() && next.account === previous.account) {
        const seen = new Set(
          visible(previous.entities, "Today").map((item) => item.id),
        );
        const added = visible(next.entities, "Today")
          .filter((item) => !seen.has(item.id))
          .map((item) => item.id);
        if (added.length)
          setNewToday((ids) => [...new Set([...ids, ...added])]);
      }
      const previousById = new Map(
        previous.entities.map((entity) => [entity.id, entity]),
      );
      return {
        ...next,
        entities: next.entities.map((entity) => {
          const old = previousById.get(entity.id);
          return old &&
            old.kind === entity.kind &&
            JSON.stringify(old.props) === JSON.stringify(entity.props)
            ? old
            : entity;
        }),
      };
    });
  }
  function closeSettings() {
    setSettings(false);
    queueMicrotask(() =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Settings"]')
        ?.focus({ preventScroll: true }),
    );
  }
  function openSettings() {
    if (editing()) {
      toast("Save or close the open to-do first.");
      return;
    }
    setSettings(true);
  }
  let saveEditor:
    ((handoff?: boolean) => Promise<boolean | undefined> | false) | undefined;
  const editorSaves = createEditorSaves<EditorDraft>();
  const failedEditors = new Map<string, string>();
  const [draftRevision, setDraftRevision] = createSignal(0);
  let currentEditor: EditorSession<EditorDraft> | undefined;
  function releaseEditor(session: EditorSession<EditorDraft>) {
    if (editorSaves.drafts.get(session.item.id) !== session) return;
    editorSaves.release(session);
    const previousError = [...failedEditors.values()].join("\n");
    failedEditors.delete(session.item.id);
    if (previousError && error() === previousError)
      setError([...failedEditors.values()].join("\n"));
    if (draft()?.id === session.item.id) setDraft(null);
    setDraftRevision((revision) => revision + 1);
  }
  function discardEditor() {
    batch(() => {
      if (currentEditor) releaseEditor(currentEditor);
      setEditing("");
    });
  }
  function persistEditor(
    session: EditorSession<EditorDraft>,
    save: () => Promise<boolean>,
  ) {
    return editorSaves.enqueue(async () => {
      const previousError = [...failedEditors.values()].join("\n");
      try {
        const saved = await save();
        failedEditors.delete(session.item.id);
        if (previousError && error() === previousError)
          setError([...failedEditors.values()].join("\n"));
        return saved;
      } catch (failure) {
        failedEditors.set(
          session.item.id,
          `${String(failure)} — Reopen “${session.read().name || title(session.item)}” to retry saving.`,
        );
        setError([...failedEditors.values()].join("\n"));
        return undefined;
      }
    });
  }
  let instantEditor = "";
  function openFind(value = "") {
    if (editing()) {
      toast("Save or close the open to-do first.");
      return;
    }
    setFindQuery(value);
    setFindIndex(0);
    setFindOpen(true);
  }
  let noticeTimer: ReturnType<typeof setTimeout>;
  let syncTimer: ReturnType<typeof setTimeout>;
  let mutationVersion = 0;
  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      if (
        !editing() &&
        !draft() &&
        state().pending &&
        state().account !== "local" &&
        pref("autoSync", true)
      )
        void refresh();
    }, 150);
  }
  async function saveReminder(item: Entity, value: string) {
    await run(async () => {
      const reminders = { ...pref("reminders", {}) },
        key = `${state().account}:${item.id}`;
      if (value) reminders[key] = value;
      else delete reminders[key];
      const preferences = { ...state().preferences, reminders };
      await call("preferences", { value: preferences });
      setState((s) => ({ ...s, preferences }));
    });
  }
  let checkingReminders = false;
  async function checkReminders() {
    if (checkingReminders || editing() || settings()) return;
    const reminders = { ...pref("reminders", {}) };
    const delivered = new Set<string>(pref("repeatRemindersDelivered", []));
    for (const item of all().filter(
      (item) => isTask(item) && !isTemplate(item) && active(item, all()),
    )) {
      const time = pref("repeatOptions", {})[
        `${state().account}:${refs(item, "rt")[0]}`
      ]?.reminderTime;
      const key = `${state().account}:${item.id}`;
      if (
        time &&
        !delivered.has(key) &&
        !reminders[key] &&
        (item.props.tir || item.props.sr)
      )
        reminders[key] = `${date(item.props.tir || item.props.sr)}T${time}`;
    }
    const due = Object.entries(reminders).filter(
      ([key, value]: [string, any]) =>
        key.startsWith(`${state().account}:`) &&
        new Date(value).getTime() <= Date.now(),
    );
    if (!due.length) return;
    checkingReminders = true;
    await run(async () => {
      const tasks = due
        .map(([key]) => all().find((e) => `${state().account}:${e.id}` === key))
        .filter((e): e is Entity => !!e && !e.props.ss && !trashed(e));
      for (const [key] of due) {
        delete reminders[key];
        delivered.add(key);
      }
      const preferences = {
        ...state().preferences,
        reminders,
        repeatRemindersDelivered: [...delivered],
      };
      await call("preferences", { value: preferences });
      setState((s) => ({ ...s, preferences }));
      if (tasks.length) {
        toast(`Reminder: ${tasks.map(title).join(", ")}`);
        if (native())
          await call("notify_reminder", {
            message: tasks.map(title).join(", "),
          });
      }
    });
    checkingReminders = false;
  }
  const all = () => state().entities,
    areas = () =>
      all()
        .filter((e) => e.kind.startsWith("Area"))
        .sort((a, b) => (a.props.ix || 0) - (b.props.ix || 0)),
    projects = () =>
      all()
        .filter((e) => isProject(e) && active(e, all()) && !isTemplate(e))
        .sort((a, b) => (a.props.ix || 0) - (b.props.ix || 0)),
    tags = () =>
      all()
        .filter((e) => e.kind.startsWith("Tag"))
        .sort((a, b) => title(a).localeCompare(title(b))),
    current = () => all().find((e) => e.id === list()),
    chosen = () =>
      draft()?.id === selected()
        ? draft()!
        : items().find((e) => e.id === selected());
  const unfilteredItems = createMemo(() => {
    draftRevision();
    // Keep a live editor's row identity stable while an earlier save updates state.
    const entities = all().map(
      (item) => editorSaves.drafts.get(item.id)?.item || item,
    );
    return visible(entities, list(), query(), "", showLogged());
  });
  const filterTags = createMemo(() => {
    const used = new Set(
      unfilteredItems().flatMap((item) => [...effectiveTags(item, all())]),
    );
    if (current())
      for (const id of effectiveTags(current()!, all())) used.add(id);
    return tags().filter((tag) => used.has(tag.id));
  });
  const items = createMemo(() => {
    draftRevision();
    const newDrafts = [
      ...(draft() ? [draft()!] : []),
      ...Array.from(editorSaves.drafts.values(), (session) => session.item),
    ].filter((item) => !all().some((saved) => saved.id === item.id));
    return [
      ...new Map(
        [
          ...newDrafts,
          ...unfilteredItems().filter(
            (e) =>
              (!tag() || effectiveTags(e, all()).has(tag())) &&
              (showLater() || !current() || !later(e)),
          ),
        ].map((item) => [item.id, item] as const),
      ).values(),
    ];
  });
  const sections = createMemo(() =>
    listSections(
      items(),
      all(),
      query() ? "Search" : list(),
      upcomingCalendar(),
    ),
  );
  const visibleNewTasks = createMemo(() => {
    const ids = new Set([
      ...newTasks(),
      ...(list() === "Today" ? newToday() : []),
    ]);
    return items().filter((item) => ids.has(item.id));
  });
  const newTodayIds = createMemo(
    () =>
      new Set(
        list() === "Today" ? visibleNewTasks().map((item) => item.id) : [],
      ),
  );
  const isNewToday = (id: string) => newTodayIds().has(id);
  const pref = (key: string, fallback: any) =>
    state().preferences[key] ?? fallback;
  createEffect(
    on(
      items,
      (rows) => {
        const visible = new Set(rows.map((item) => item.id));
        const remaining = selection().filter((id) => visible.has(id));
        if (remaining.length === selection().length) return;
        batch(() => {
          setSelection(remaining);
          if (!visible.has(selected()) && editing() !== selected())
            setFocused(remaining.at(-1) || "");
        });
      },
      { defer: true },
    ),
  );
  createEffect(
    on(
      editing,
      (id) => {
        if (!id && state().pending) scheduleSync();
      },
      { defer: true },
    ),
  );
  const toast = (text: string) => {
    setNotice(text);
    resumeNotice();
  };
  const pauseNotice = () => clearTimeout(noticeTimer);
  const resumeNotice = () => {
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => setNotice(""), 4000);
  };
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      setError("");
      return await fn();
    } catch (e) {
      setError(String(e));
      return undefined;
    }
  }
  async function refresh() {
    if (busy()) return;
    if (editing()) {
      toast("Save or close the open to-do before syncing.");
      return;
    }
    setBusy(true);
    const startedAt = mutationVersion;
    const synced = await run(async () => {
      applyIncoming(await call("sync"));
      return true;
    });
    if (native()) await run(async () => setState(await call("load")));
    setBusy(false);
    if (
      synced &&
      mutationVersion !== startedAt &&
      state().pending &&
      !state().blocked
    )
      scheduleSync();
  }
  async function mutate(changes: Changes, confirmed = false, remember = true) {
    const inverse: Changes = {};
    for (const [id, ev] of Object.entries(changes)) {
      const old = all().find((x) => x.id === id);
      if (ev.t === 0) inverse[id] = { e: ev.e, t: 2, p: {} };
      else if (old && ev.t === 1)
        inverse[id] = {
          e: old.kind,
          t: 1,
          p: Object.fromEntries(
            Object.keys(ev.p).map((k) => [k, old.props[k] ?? null]),
          ),
        };
    }
    const next = await call("mutate", { changes, confirm: confirmed });
    mutationVersion++;
    setState(next);
    if (remember) setUndo(inverse);
    scheduleSync();
  }
  async function createTag(name: string): Promise<string> {
    const existing = tags().find(
      (t) => title(t).toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
    );
    if (existing) return existing.id;
    const changes = create("Tag4", { tt: name.trim(), sh: "", pn: [] });
    await mutate(changes);
    return Object.keys(changes)[0];
  }
  async function patch(e: Entity, p: Props) {
    return run(() => mutate(event(e, p)));
  }
  function beginCreate(kind: string | null) {
    if (kind) setSettings(false);
    if (kind && editing()) {
      toast("Save or close the open to-do first.");
      return;
    }
    if (kind === "Heading" && current() && isProject(current()!)) {
      const changes = create("Task6", {
        tt: "",
        tp: 2,
        st: 1,
        pr: [current()!.id],
      });
      const id = Object.keys(changes)[0];
      setDraft({ id, kind: "Task6", props: changes[id].p });
      setSelected(id);
      setEditing(id);
      return;
    }
    if (kind !== "To-Do") {
      setCreating(kind);
      return;
    }
    if (editing()) {
      toast("Save or close the open to-do first.");
      return;
    }
    setQuery("");
    const dest = chosen() && isHeading(chosen()!) ? chosen() : current();
    const props = {
      tt: "",
      tp: 0,
      ss: 0,
      tr: false,
      ix: Date.now(),
      ...(dest
        ? move({ id: "", kind: "Task6", props: {} }, dest)
        : schedule(
            ["Today", "Someday", "Anytime"].includes(list())
              ? list()
              : pref("defaultList", "Inbox"),
          )),
    };
    const item = { id: uuid(), kind: "Task6", props };
    setDraft(item);
    setSelected(item.id);
    setEditing(item.id);
    setTimeout(
      () =>
        document
          .querySelector<HTMLInputElement>(".editor-title input")
          ?.focus(),
      0,
    );
  }
  function navigate(id: string) {
    if (editing()) {
      toast("Save or close the open to-do first.");
      return;
    }
    setSettings(false);
    setRecentItems((ids) =>
      [id, ...ids.filter((value) => value !== id)].slice(0, 8),
    );
    setList(id);
    setQuery("");
    setTag("");
    setShowLater(true);
    setShowLogged(false);
    setSelected("");
    setMenu(false);
  }
  function openItem(e: Entity) {
    if (editing() && editing() !== e.id) {
      toast("Save or close the open to-do first.");
      return;
    }
    setSelected(e.id);
    setRecentItems((ids) =>
      [e.id, ...ids.filter((value) => value !== e.id)].slice(0, 8),
    );
    if (isProject(e)) {
      navigate(e.id);
    } else setEditing(e.id);
  }
  function ask(text: string, action: () => Promise<void>) {
    setConfirm({ text, action });
    setMenu(false);
  }
  async function complete(e: Entity, cancel = false) {
    if (isTemplate(e)) return;
    if (editing() && editing() !== e.id)
      throw Error("Save or close the open to-do first.");
    const changes = event(e, {
      ss: e.props.ss ? 0 : cancel ? 2 : 3,
      sp: e.props.ss ? null : Date.now() / 1000,
    });
    const session = editorSaves.drafts.get(e.id);
    await editorSaves.enqueue(() => mutate(changes));
    batch(() => {
      if (session && currentEditor === session) setEditing("");
      if (session) releaseEditor(session);
    });
  }
  async function remove(e: Entity) {
    if (isTemplate(e)) {
      ask(
        "Move this repeating schedule to Trash? Future copies will stop; existing copies stay in your lists.",
        async () => {
          await mutate(event(e, { tr: true }), true);
          discardEditor();
        },
      );
      return;
    }
    const session = editorSaves.drafts.get(e.id);
    await editorSaves.enqueue(async () => {
      if (all().some((saved) => saved.id === e.id))
        await mutate(event(e, { tr: true }));
    });
    batch(() => {
      if (session && currentEditor === session) setEditing("");
      if (session) releaseEditor(session);
      if (draft()?.id === e.id) setDraft(null);
    });
  }
  async function reorder(e: Entity, direction: number) {
    const arr = rowPeers(e),
      index = arr.findIndex((x) => x.id === e.id),
      other = arr[index + direction];
    if (!other) return;
    await mutate(
      orderBefore(
        arr,
        e,
        other,
        direction > 0,
        list() === "Today" ? "ti" : "ix",
      ),
    );
  }
  function rowPeers(item: Entity) {
    return items().filter(
      (x) =>
        x.id !== draft()?.id &&
        !x.props.ss &&
        isHeading(x) === isHeading(item) &&
        isProject(x) === isProject(item) &&
        (list() === "Today"
          ? (x.props.sb || 0) === (item.props.sb || 0)
          : scheduleBucket(x) === scheduleBucket(item) &&
            (isHeading(item) ||
              refs(x, "agr").join() === refs(item, "agr").join()) &&
            (current() || container(x, all()) === container(item, all()))),
    );
  }
  let suppressRowClickUntil = 0;
  function rowDrop(e: DragEvent, target: Entity) {
    e.preventDefault();
    e.stopPropagation();
    const id = dragging() || e.dataTransfer?.getData("text/plain");
    const moved = all().find((x) => x.id === id);
    const row = e.currentTarget as HTMLElement;
    const after =
      dropTarget()?.id === target.id
        ? dropTarget()!.after
        : e.clientY >
          row.getBoundingClientRect().y +
            row.getBoundingClientRect().height / 2;
    setDragging("");
    setDropTarget(null);
    suppressRowClickUntil = Date.now() + 250;
    if (
      !moved ||
      moved.id === target.id ||
      editing() ||
      query() ||
      ["Logbook", "Trash", "Upcoming"].includes(list())
    )
      return;
    if (
      (isHeading(target) || isProject(target)) &&
      !isHeading(moved) &&
      !isProject(moved)
    ) {
      const { st, ...location } = move(moved, target);
      void patch(moved, {
        ...location,
        ix:
          Math.min(
            0,
            ...all()
              .filter(
                (x) =>
                  refs(x, "agr").includes(target.id) ||
                  refs(x, "pr").includes(target.id),
              )
              .map((x) => x.props.ix || 0),
          ) - 1024,
      });
      return;
    }
    if (
      isHeading(moved) !== isHeading(target) ||
      isProject(moved) !== isProject(target)
    )
      return;
    if (
      list() !== "Today" &&
      scheduleBucket(moved) !== scheduleBucket(target)
    ) {
      toast(
        "Items keep their schedule when reordered. Change When to move between schedule groups.",
      );
      return;
    }
    const peers = rowPeers(target);
    if (!peers.some((x) => x.id === moved.id)) peers.push(moved);
    const changes = orderBefore(
      peers,
      moved,
      target,
      after,
      list() === "Today" ? "ti" : "ix",
    );
    if (!changes[moved.id]) return;
    if (list() === "Today") changes[moved.id].p.sb = target.props.sb || 0;
    else if (
      !isProject(moved) &&
      !isHeading(moved) &&
      current() &&
      isProject(current()!)
    ) {
      changes[moved.id].p.agr = refs(target, "agr");
      changes[moved.id].p.pr = refs(target, "pr");
    }
    void run(() => mutate(changes));
  }
  async function duplicate(e: Entity) {
    if (editing()) throw Error("Save or close the open to-do first.");
    const { changes, id } = duplicateTree(e, all());
    await mutate(changes);
    setSelected(id);
    if (isProject(e)) navigate(id);
    else setEditing(id);
  }
  function key(e: KeyboardEvent) {
    if (connectionOpen()) return;
    if (
      e.defaultPrevented ||
      document.querySelector(
        "dialog[open], .select-popup:popover-open, .control-popover:popover-open",
      )
    )
      return;
    const typing = (e.target as HTMLElement).matches(
      "input,textarea,select,[contenteditable]",
    );
    const cmd = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (cmd && k === ",") {
      e.preventDefault();
      openSettings();
      return;
    }
    if (cmd && k === "f") {
      e.preventDefault();
      openFind();
      return;
    }
    if (cmd && k === "n") {
      e.preventDefault();
      beginCreate(e.altKey ? "Project" : e.shiftKey ? "Heading" : "To-Do");
      return;
    }
    if (cmd && /^[1-7]$/.test(k)) {
      e.preventDefault();
      navigate(lists[Number(k) - 1]);
      return;
    }
    if (cmd && k === "/") {
      e.preventDefault();
      setSidebar((v) => !v);
      return;
    }
    if (
      typing ||
      (!cmd &&
        [" ", "Enter"].includes(e.key) &&
        (e.target as HTMLElement).closest("button,summary,a"))
    )
      return;
    if (settings()) {
      if (e.key === "Escape") closeSettings();
      return;
    }
    const item = chosen();
    if (cmd && k === "z" && undo()) {
      e.preventDefault();
      void run(async () => {
        await mutate(undo()!, true, false);
        setUndo(null);
      });
      return;
    }
    if (cmd && k === "a") {
      e.preventDefault();
      setSelection(items().map((row) => row.id));
      setFocused(items()[0]?.id || "");
      selectionAnchor = items()[0]?.id || "";
      return;
    }
    if (cmd && k === "k" && item) {
      e.preventDefault();
      void completeSelection(e.altKey);
      return;
    }
    if (cmd && k === "d" && !e.shiftKey && item) {
      e.preventDefault();
      void run(() => duplicate(item));
      return;
    }
    if (cmd && ["t", "e", "r", "o"].includes(k) && item) {
      e.preventDefault();
      void patchSelection(
        schedule(
          (
            {
              t: "Today",
              e: "This Evening",
              r: "Anytime",
              o: "Someday",
            } as Props
          )[k],
        ),
      );
      return;
    }
    if (cmd && e.shiftKey && k === "m" && item) {
      e.preventDefault();
      setMoving(true);
      return;
    }
    if (
      cmd &&
      (k === "s" || (e.shiftKey && ["d", "r", "t"].includes(k))) &&
      item
    ) {
      e.preventDefault();
      setEditing(item.id);
      return;
    }
    if (e.key === "Escape") {
      setEditing("");
      setSelected("");
      setDraft(null);
      setQuery("");
      setTag("");
      setMenu(false);
      return;
    }
    if ((e.key === "Backspace" || e.key === "Delete") && item) {
      e.preventDefault();
      void removeSelection();
      return;
    }
    if (e.key === "Enter" && item) {
      e.preventDefault();
      openItem(item);
      return;
    }
    if ((e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) && item) {
      e.preventDefault();
      openTaskMenu(item);
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      beginCreate("To-Do");
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      if (cmd && item) {
        void run(() => reorder(item, d));
        return;
      }
      const i = items().findIndex((x) => x.id === selected());
      const next = items()[Math.max(0, Math.min(items().length - 1, i + d))];
      if (next) {
        if (e.shiftKey) selectItem(next, e);
        else setSelected(next.id);
        document
          .getElementById("item-" + next.id)
          ?.scrollIntoView({ block: "nearest" });
      }
      return;
    }
    if (!cmd && !e.altKey && e.key.length === 1) {
      openFind(e.key);
    }
  }
  onMount(() => {
    let handoffClick:
      { id: string; x: number; y: number; time: number } | undefined;
    const saveOutside = (e: MouseEvent) => {
      // Closing an editor moves the next row between the two clicks; keep the original target.
      if (
        handoffClick &&
        !editing() &&
        e.button === 0 &&
        e.timeStamp - handoffClick.time < 400 &&
        Math.abs(e.clientX - handoffClick.x) <= 4 &&
        Math.abs(e.clientY - handoffClick.y) <= 4
      ) {
        const item = items().find((item) => item.id === handoffClick!.id);
        handoffClick = undefined;
        if (item) {
          e.preventDefault();
          e.stopImmediatePropagation();
          openItem(item);
          return;
        }
      }
      const target = e.target;
      if (
        !editing() ||
        !(target instanceof Element) ||
        target.closest(
          ".task-editor,.inline-heading-editor,.editor-footer,.control-popover,.select-popup,dialog",
        )
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const row = target.closest<HTMLElement>(".task-row"),
        rowId = row?.id.slice(5),
        control = target.closest<HTMLElement>(
          "button,a,input,[data-row-control]",
        );
      const save = saveEditor?.(true);
      if (!save) return;
      const item =
        rowId && !control
          ? items().find((item) => item.id === rowId)
          : undefined;
      if (item) {
        handoffClick = {
          id: item.id,
          x: e.clientX,
          y: e.clientY,
          time: e.timeStamp,
        };
        if (!isProject(item)) instantEditor = item.id;
        batch(() => {
          setSelected(item.id);
          setEditing("");
        });
        return;
      }
      const previousEditor = currentEditor;
      void save.then((saved) => {
        if (!saved) return;
        if (currentEditor && currentEditor !== previousEditor) return;
        if (rowId && !control) {
          const item = all().find((item) => item.id === rowId);
          if (item) {
            setSelected(item.id);
          }
        } else if (target.isConnected)
          (
            target.closest<HTMLElement>("button,a,input,label,[tabindex]") ||
            (target as HTMLElement)
          ).click?.();
      });
    };
    const dismiss = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".list-menu,.toolbar-actions"))
        setMenu(false);
    };
    const deselectOutside = (e: MouseEvent) => {
      if (
        !editing() &&
        e.target instanceof Element &&
        !e.target.closest(
          ".task-row,.task-editor,.inline-heading-editor,.editor-footer,.control-popover,.select-popup,dialog,button,a,input,textarea,[role=separator]",
        )
      )
        setSelected("");
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("click", saveOutside, true);
    document.addEventListener("click", deselectOutside);
    document.addEventListener("keydown", key);
    let unlisten: undefined | (() => void);
    let unlistenWorkspace: undefined | (() => void);
    let unlistenSyncError: undefined | (() => void);
    if (native()) {
      void run(async () => {
        setState(await call("load"));
        setSidebarWidth(
          Math.max(
            180,
            Math.min(380, Number(pref("sidebarWidth", 236)) || 236),
          ),
        );
        if (state().account !== "local") void refresh();
        else if (!state().entities.length && !pref("welcomeSeen", false))
          setConnectionOpen(true);
      }).finally(() => setLoading(false));
      void listen<string>("sync-error", (e) => setError(e.payload)).then(
        (f) => (unlistenSyncError = f),
      );
      void listen("workspace-changed", () => {
        if (!editing()) void run(async () => applyIncoming(await call("load")));
      }).then((f) => (unlistenWorkspace = f));
      void listen<string>("menu-action", (ev) => {
        if (
          connectionOpen() ||
          document.querySelector(
            "dialog[open], .select-popup:popover-open, .control-popover:popover-open",
          )
        )
          return;
        const a = ev.payload;
        if (a === "settings") openSettings();
        if (a === "new") beginCreate("To-Do");
        if (a === "project") beginCreate("Project");
        if (a === "heading") beginCreate("Heading");
        if (a === "sync") void refresh();
        if (a === "search") openFind();
        if (a === "quick-entry") void run(() => call("quick_entry"));
      }).then((f) => (unlisten = f));
    } else setLoading(false);
    const interval = setInterval(() => {
      if (pref("autoSync", true) && state().account !== "local" && !editing())
        void refresh();
      else if (native() && state().account === "local" && !editing())
        void run(async () => applyIncoming(await call("load")));
    }, 60000);
    const reminderInterval = setInterval(() => void checkReminders(), 15000);
    onCleanup(() => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("click", saveOutside, true);
      document.removeEventListener("click", deselectOutside);
      unlisten?.();
      unlistenWorkspace?.();
      unlistenSyncError?.();
      clearInterval(interval);
      clearInterval(reminderInterval);
      clearTimeout(noticeTimer);
      clearTimeout(syncTimer);
    });
  });
  function group(e: Entity) {
    if (query()) return "";
    if (list() === "Today") return e.props.sb ? "This Evening" : "Today";
    if (list() === "Upcoming") {
      const d = e.props.sr || e.props.dd;
      return d
        ? new Date(d * 1000).toLocaleDateString("en", {
            weekday: "long",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })
        : "";
    }
    if (list() === "Logbook" && e.props.sp)
      return new Date(e.props.sp * 1000).toLocaleDateString("en", {
        month: "long",
        year: "numeric",
      });
    if (current() && e.props.ss) return "";
    if (current() && !isHeading(e) && scheduleBucket(e))
      return scheduleBucket(e) === 2 ? "Someday" : "Later";
    return "";
  }
  const motion = installMotion(() => pref("motion", true));
  createEffect(
    on([list, loading], ([, isLoading]) => {
      if (!isLoading)
        queueMicrotask(() => {
          const page = document.querySelector(".list-page");
          if (page) motion.enter(page);
        });
    }),
  );
  createEffect(() => {
    if (!pref("motion", true)) motion.cancel();
  });
  onCleanup(() => motion.dispose());
  async function persistSidebarWidth(value: number) {
    const preferences = { ...state().preferences, sidebarWidth: value };
    await run(async () => {
      await call("preferences", { value: preferences });
      setState((s) => ({ ...s, preferences }));
    });
  }
  function resizeSidebar(e: PointerEvent) {
    const startX = e.clientX,
      width = sidebar() ? sidebarWidth() : 0;
    let moved = false;
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const update = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - startX) < 3 && !moved) return;
      moved = true;
      const value = width + ev.clientX - startX;
      setSidebar(value >= 130);
      if (value >= 130) setSidebarWidth(Math.max(180, Math.min(380, value)));
    };
    const end = () => {
      handle.removeEventListener("pointermove", update);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      if (!moved) setSidebar((open) => !open);
      void persistSidebarWidth(sidebarWidth());
    };
    handle.addEventListener("pointermove", update);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }
  return (
    <FeedbackContext.Provider value={error}>
      <div
        class="app relative grid h-dvh grid-rows-[minmax(0,1fr)] bg-bg text-ink overflow-clip selection:bg-selection selection:text-ink"
        classList={{
          "grid-cols-1": !sidebar(),
          "grid-cols-[var(--sidebar-width)_minmax(0,1fr)]": sidebar(),
        }}
        style={{
          // The user can resize the sidebar continuously; only this measured width is dynamic.
          "--sidebar-width": `${sidebarWidth()}px`,
        }}
        data-theme={pref("theme", "dark")}
        data-density={pref("density", "comfortable")}
        data-motion={pref("motion", true) ? "on" : "off"}
      >
        <div
          class="titlebar absolute top-0 left-0 z-10 flex h-10 items-center justify-end self-start pl-22 text-xs tracking-wide text-quiet select-none"
          style={{ width: `${sidebar() ? sidebarWidth() : 136}px` }}
          data-tauri-drag-region
        ></div>
        <div
          class="sidebar-resizer group/resize absolute inset-y-0 z-30 w-5 cursor-col-resize touch-none outline-none"
          style={{ left: `${sidebar() ? sidebarWidth() - 4 : 0}px` }}
          role="separator"
          aria-label="Sidebar width"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={380}
          aria-valuenow={sidebar() ? sidebarWidth() : 0}
          aria-valuetext={
            sidebar()
              ? `${sidebarWidth()} pixels; click to collapse`
              : "Collapsed; click to show sidebar"
          }
          title="Click to toggle sidebar · Drag to resize (⌘ /)"
          tabindex="0"
          onPointerDown={resizeSidebar}
          onKeyDown={(e) => {
            if (["Enter", " ", "Home", "End"].includes(e.key)) {
              e.preventDefault();
              setSidebar((open) =>
                e.key === "Home" ? false : e.key === "End" ? true : !open,
              );
            }
            if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
              e.preventDefault();
              setSidebar(true);
              const width = Math.max(
                180,
                Math.min(
                  380,
                  sidebarWidth() + (e.key === "ArrowRight" ? 10 : -10),
                ),
              );
              setSidebarWidth(width);
              void persistSidebarWidth(width);
            }
          }}
        >
          <span class="sidebar-resize-handle pointer-events-none absolute top-1/2 left-2 h-12 w-2 -translate-y-1/2 rounded-full bg-quiet/35 opacity-0 transition-opacity group-hover/resize:opacity-100 group-focus-visible/resize:opacity-100 [@media(hover:none)]:opacity-100" />
        </div>
        <Show when={sidebar()}>
          <aside
            class="sidebar relative col-start-1 row-span-full row-start-1 flex min-h-0 min-w-0 flex-col bg-linear-to-b from-sidebar-start to-sidebar-end pt-14"
            inert={connectionOpen()}
          >
            <div class="sidebar-body min-h-0 flex-1 overflow-auto overscroll-contain px-4 pb-4 [scrollbar-gutter:stable]">
              <nav aria-label="Lists">
                <For each={lists}>
                  {(name, i) => {
                    const Icon = navIcons[i()];
                    return (
                      <NavigationItem
                        aria-label={name}
                        class="nav-item [&:nth-child(2)]:mt-3.5 [&:nth-child(6)]:mt-3.5"
                        classList={{ active: list() === name && !query() }}
                        onClick={() => navigate(name)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const item = all().find(
                            (x) =>
                              x.id === e.dataTransfer?.getData("text/plain"),
                          );
                          if (item) {
                            void patch(
                              item,
                              name === "Trash"
                                ? { tr: true }
                                : name === "Logbook"
                                  ? { ss: 3, sp: Date.now() / 1000 }
                                  : schedule(
                                      name === "Upcoming" ? "Date" : name,
                                      date(today() + 86400),
                                    ),
                            );
                          }
                        }}
                      >
                        <Icon
                          size={18}
                          class={
                            list() === name && !query()
                              ? "text-accent"
                              : [
                                  "text-quiet",
                                  "text-accent",
                                  "text-upcoming",
                                  "text-anytime",
                                  "text-someday",
                                  "text-quiet",
                                  "text-quiet",
                                ][i()]
                          }
                        />
                        <span class="sidebar-label block min-w-0 truncate">
                          {name}
                        </span>
                        <Show
                          when={
                            ["Inbox", "Today"].includes(name) &&
                            visible(all(), name).length
                          }
                        >
                          <span class="count ml-auto font-mono text-xs text-quiet">
                            {visible(all(), name).length}
                          </span>
                        </Show>
                      </NavigationItem>
                    );
                  }}
                </For>
              </nav>
              <div class="containers mt-4 min-w-0 [&>.area-group:not(:first-child)]:mt-4.5">
                <For each={projects().filter((e) => !refs(e, "ar").length)}>
                  {(p) => <ProjectNav p={p} />}
                </For>
                <For each={areas()}>
                  {(a) => (
                    <div
                      class="area-group"
                      draggable="true"
                      onDragStart={(e) =>
                        e.dataTransfer?.setData("text/plain", a.id)
                      }
                    >
                      <div
                        class="area-row group/area relative"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.stopPropagation();
                          dropIn(e, a);
                        }}
                      >
                        <Button
                          variant="bare"
                          class="area-toggle absolute top-0 right-2 z-1 size-8 min-h-8 rounded p-1.5 text-quiet opacity-0 group-hover/area:opacity-100 keyboard-input:group-focus-within/area:opacity-100 hover:bg-transparent hover:text-ink"
                          aria-label={`${collapsed().includes(a.id) ? "Expand" : "Collapse"} ${title(a)}`}
                          aria-expanded={!collapsed().includes(a.id)}
                          onClick={() =>
                            setCollapsed((v) =>
                              v.includes(a.id)
                                ? v.filter((x) => x !== a.id)
                                : [...v, a.id],
                            )
                          }
                        >
                          {collapsed().includes(a.id) ? (
                            <ChevronRight size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </Button>
                        <NavigationItem
                          class="area-link pr-9 font-semibold group-hover/area:bg-hover [&.active]:group-hover/area:bg-selection"
                          classList={{ active: list() === a.id }}
                          onClick={() => navigate(a.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => dropIn(e, a)}
                        >
                          <AreaIcon stacked={collapsed().includes(a.id)} />
                          <span class="sidebar-label block min-w-0 truncate">
                            {title(a)}
                          </span>
                        </NavigationItem>
                      </div>
                      <Show when={!collapsed().includes(a.id)}>
                        <For
                          each={projects().filter((p) =>
                            refs(p, "ar").includes(a.id),
                          )}
                        >
                          {(p) => <ProjectNav p={p} />}
                        </For>
                      </Show>
                    </div>
                  )}
                </For>
                <Show when={!areas().length && !projects().length}>
                  <p class="sidebar-hint p-3.5 text-xs leading-relaxed text-quiet [&>button]:mt-1.5 [&>button]:text-xs [&>button]:text-muted">
                    Make room for what matters.
                    <br />
                    <Button size="small" onClick={() => beginCreate("Area")}>
                      Create an area <Plus size={12} />
                    </Button>
                  </p>
                </Show>
              </div>
            </div>
            <div class="sidebar-bottom flex h-12 min-h-12 shrink-0 items-center gap-1 border-t border-hover px-4">
              <NavigationItem
                class="sidebar-new-list min-w-0 w-auto text-sm"
                aria-label="New project or area"
                onClick={() => beginCreate("Project")}
              >
                <Plus size={16} />
                <span>New List</span>
              </NavigationItem>
              <IconButton
                size="small"
                variant="quiet"
                class="ml-auto hover:bg-transparent"
                aria-label="Settings"
                onClick={() => openSettings()}
              >
                <SettingsIcon size={17} />
              </IconButton>
            </div>
          </aside>
        </Show>
        <main
          class="relative isolate z-3 flex min-h-0 min-w-0 flex-col"
          inert={connectionOpen()}
        >
          <svg
            class="workspace-curves pointer-events-none absolute top-0 right-0 -z-1 h-56 w-7/8 opacity-30"
            viewBox="0 0 1000 220"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M0 91C175-8 217 160 433 101S743-13 1000 94"
              stroke="#ffc200"
              stroke-width=".6"
            />
            <path
              d="M0 103C174 4 226 174 437 115S749 2 1000 108"
              stroke="#bf00ff"
              stroke-width=".6"
            />
            <path
              d="M554 0C649 15 679 29 732 80S833 176 1000 180"
              stroke="#00ffd0"
              stroke-width=".45"
            />
          </svg>
          <div class="top-tools absolute top-0 right-0 z-10 flex h-14 shrink-0 items-center justify-end gap-2 px-7">
            <IconButton
              size="compact"
              variant="quiet"
              class="search-box text-quiet has-focus-visible:ring-2 has-focus-visible:ring-mint has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-bg"
              aria-label="Search all items"
              title="Quick Find (⌘ F)"
              onClick={() => openFind()}
            >
              <Search size={16} />
            </IconButton>
            <div class="toolbar-actions flex gap-2 text-muted">
              <IconButton
                size="compact"
                variant="quiet"
                aria-label="Sync now"
                title="Sync now"
                onClick={() => void refresh()}
                disabled={busy()}
              >
                <RefreshCw size={16} classList={{ "animate-spin": busy() }} />
              </IconButton>
              <IconButton
                size="compact"
                variant="quiet"
                aria-label="List options"
                aria-haspopup="true"
                aria-expanded={menu()}
                onClick={() => {
                  setMenu((v) => !v);
                  if (menu())
                    queueMicrotask(() =>
                      document
                        .querySelector<HTMLButtonElement>(".list-menu button")
                        ?.focus({ preventScroll: true }),
                    );
                }}
              >
                <MoreHorizontal size={20} />
              </IconButton>
            </div>
            <Show when={menu()}>
              <Menu
                class="popover list-menu floating-surface absolute top-12 right-7 z-20 max-h-[calc(100dvh_-_--spacing(20))] w-72 max-w-[calc(100vw_-_--spacing(6))] overflow-y-auto rounded-2xl bg-surface/65 p-2 text-ink shadow-2xl backdrop-blur-xl [&>hr]:mx-2 [&>hr]:my-1 [&>hr]:border-0 [&>hr]:border-t [&>hr]:border-hover"
                aria-label="List actions"
                close={() => {
                  setMenu(false);
                  document
                    .querySelector<HTMLButtonElement>(
                      '[aria-label="List options"]',
                    )
                    ?.focus();
                }}
              >
                <div class="menu-connection grid grid-cols-[--spacing(3.5)_1fr] items-center gap-2 px-3 pt-2.5 pb-3 [&>strong]:text-xs [&>strong]:font-medium [&>span:last-child]:col-start-2 [&>span:last-child]:text-xs [&>span:last-child]:leading-5 [&>span:last-child]:text-muted">
                  <span
                    class="menu-status-mark size-1.5 rounded-full bg-mint ring-4 ring-mint/15 [&.pending]:bg-accent [&.blocked]:bg-danger"
                    classList={{
                      pending: busy() || !!state().pending,
                      blocked: state().blocked,
                    }}
                  />
                  <strong>
                    {state().blocked
                      ? "Sync needs attention"
                      : busy()
                        ? "Syncing…"
                        : state().account === "local"
                          ? "Saved on this Mac"
                          : "Things Cloud"}
                  </strong>
                  <span>
                    {state().account === "local"
                      ? "Your tasks are stored on this computer."
                      : state().pending
                        ? `${state().pending} pending changes`
                        : "Your tasks are saved on this computer and connected to Things Cloud."}
                  </span>
                </div>
                <MenuItem
                  onClick={() => {
                    beginCreate("To-Do");
                    setMenu(false);
                  }}
                >
                  <Plus size={16} /> New To-Do <Kbd>⌘ N</Kbd>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    beginCreate("Project");
                    setMenu(false);
                  }}
                >
                  <Folder size={16} /> New Project
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    beginCreate("Area");
                    setMenu(false);
                  }}
                >
                  <Box size={16} /> New Area
                </MenuItem>
                <Show when={current() && isProject(current()!)}>
                  <MenuItem
                    onClick={() => {
                      beginCreate("Heading");
                      setMenu(false);
                    }}
                  >
                    <ListChecks size={16} /> New Heading
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setShowLater((v) => !v);
                      setMenu(false);
                    }}
                  >
                    <Archive size={16} /> {showLater() ? "Hide" : "Show"} later
                    items
                  </MenuItem>
                </Show>
                <Show when={current()}>
                  <MenuItem
                    onClick={() => {
                      beginCreate("Rename");
                      setMenu(false);
                    }}
                  >
                    <FileText size={16} /> Rename list
                  </MenuItem>
                  <Show when={current() && isProject(current()!)}>
                    <MenuItem
                      onClick={() => void run(() => complete(current()!))}
                    >
                      <Check size={16} /> Complete project
                    </MenuItem>
                    <MenuItem
                      onClick={() => void run(() => remove(current()!))}
                    >
                      <Trash2 size={16} /> Move project to Trash
                    </MenuItem>
                  </Show>
                </Show>
                <hr />
                <MenuItem
                  onClick={() => {
                    navigate("Repeating");
                    setMenu(false);
                  }}
                >
                  <RotateCw size={16} /> Repeating items
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    navigate("Deadlines");
                    setMenu(false);
                  }}
                >
                  <Flag size={16} /> Deadlines
                </MenuItem>
                <hr />
                <MenuItem
                  onClick={() => {
                    openSettings();
                    setMenu(false);
                  }}
                >
                  <SettingsIcon size={16} /> Settings… <Kbd>⌘ ,</Kbd>
                </MenuItem>
              </Menu>
            </Show>
          </div>
          <Show when={!native()}>
            <div class="preview-note bg-surface px-7 py-2 text-xs text-quiet">
              Visual preview · Open the installed app to save tasks and connect
              Things Cloud.
            </div>
          </Show>
          <Show when={error()}>
            <div
              role="alert"
              class="notice error mx-6 mb-2.5 flex items-start justify-between rounded-lg px-4 py-3 text-xs leading-relaxed bg-danger/10 text-danger"
            >
              <span>{error()}</span>
              <IconButton
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </IconButton>
            </div>
          </Show>
          <Show
            when={!settings()}
            fallback={
              <SettingsPage
                state={state()}
                tab={settingsTab()}
                setTab={setSettingsTab}
                backLabel={current() ? title(current()!) : list()}
                close={closeSettings}
                connect={() => {
                  setSettings(false);
                  setConnectionOpen(true);
                }}
                syncing={busy()}
                sync={refresh}
                changeState={setState}
                mutate={mutate}
                run={run}
                ask={ask}
              />
            }
          >
            <section
              class="list-page relative min-h-0 flex-1 overflow-auto pl-16 pr-11 pt-14 pb-9 max-lg:pr-7 max-lg:pb-8"
              data-list={list()}
            >
              <header class="page-header relative mb-4.5 pb-4 has-[.header-controls:empty]:[&>.page-divider]:hidden">
                <div class="heading-line flex items-baseline gap-3">
                  <span class="page-symbol flex size-8 shrink-0 items-center justify-center self-center text-accent [&>svg]:size-8 [&>svg]:shrink-0 [&>svg]:stroke-1 [&>.project-ring]:size-8">
                    {list() === "Inbox" ? (
                      <Inbox />
                    ) : list() === "Today" ? (
                      <Star />
                    ) : list() === "Upcoming" ? (
                      <CalendarDays />
                    ) : list() === "Trash" ? (
                      <Trash2 />
                    ) : list() === "Logbook" ? (
                      <BookOpen />
                    ) : current() && isProject(current()!) ? (
                      <ProjectProgress project={current()!} />
                    ) : current()?.kind.startsWith("Area") ? (
                      <AreaIcon />
                    ) : (
                      <Layers />
                    )}
                  </span>
                  <h1 class="min-w-0 font-serif text-4xl leading-tight font-medium tracking-tight wrap-anywhere [&_[data-motion-word]]:inline-block">
                    <For
                      each={(query()
                        ? "Search results"
                        : current()
                          ? title(current()!)
                          : list()
                      ).split(" ")}
                    >
                      {(word) => (
                        <span data-motion-word>
                          {word}
                          {"\u00a0"}
                        </span>
                      )}
                    </For>
                  </h1>
                </div>
                <Show when={current() && isProject(current()!)}>
                  <Textarea
                    variant="plain"
                    autosize
                    class="project-notes mt-3 block min-h-8 w-full px-0 py-1 text-sm leading-relaxed text-muted"
                    rows="1"
                    aria-label="Project notes"
                    placeholder="Add notes to this project…"
                    value={noteText(current()!)}
                    onChange={(e) =>
                      void patch(current()!, { nt: e.currentTarget.value })
                    }
                  />
                </Show>
                <div class="header-controls mt-3 flex items-start gap-2.5 empty:hidden">
                  <Show when={current()}>
                    <div class="list-tag-editor -ml-1.5 shrink-0">
                      <TagPicker
                        label="List tags"
                        compact
                        tags={tags()}
                        selected={refs(current()!, "tg")}
                        change={(ids) => void patch(current()!, { tg: ids })}
                        create={createTag}
                      />
                    </div>
                  </Show>
                  <Show when={filterTags().length}>
                    <div class="tag-filters flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <Pill selected={!tag()} onClick={() => setTag("")}>
                        All
                      </Pill>
                      <For each={filterTags()}>
                        {(t) => (
                          <Pill
                            selected={tag() === t.id}
                            onClick={() => setTag(tag() === t.id ? "" : t.id)}
                          >
                            {title(t)}
                          </Pill>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
                <div
                  class="page-divider absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-highlight/40 via-orchid/15 via-20% to-transparent"
                  aria-hidden="true"
                />
              </header>
              <Show when={visibleNewTasks().length}>
                <div
                  class="new-todos mb-7 flex items-center justify-between gap-4 rounded-lg bg-highlight/20 px-4 py-3 text-sm text-accent"
                  role="status"
                >
                  <span>
                    You have {visibleNewTasks().length} new to-do
                    {visibleNewTasks().length === 1 ? "" : "s"}
                  </span>
                  <Button
                    size="small"
                    class="bg-highlight text-on-highlight hover:bg-highlight/90"
                    onClick={() => {
                      const ids = new Set(
                        (list() === "Today"
                          ? visible(all(), "Today")
                          : visibleNewTasks()
                        ).map((item) => item.id),
                      );
                      batch(() => {
                        setNewTasks((previous) =>
                          previous.filter((id) => !ids.has(id)),
                        );
                        setNewToday((previous) =>
                          previous.filter((id) => !ids.has(id)),
                        );
                      });
                    }}
                  >
                    OK
                  </Button>
                </div>
              </Show>
              <Show when={list() === "Upcoming"}>
                <div
                  class="upcoming-switch mb-5 flex items-baseline gap-5"
                  role="group"
                  aria-label="Upcoming view"
                >
                  <UnderlineTab
                    aria-pressed={upcomingCalendar()}
                    onClick={() => setUpcomingCalendar(true)}
                  >
                    Calendar
                  </UnderlineTab>
                  <UnderlineTab
                    aria-pressed={!upcomingCalendar()}
                    onClick={() => setUpcomingCalendar(false)}
                  >
                    Scheduled only
                  </UnderlineTab>
                </div>
              </Show>
              <Show when={list() === "Trash" && items().length}>
                <Button
                  size="small"
                  variant="danger"
                  class="mb-5"
                  onClick={() =>
                    ask(
                      "Permanently delete everything in Trash? This cannot be undone.",
                      async () => {
                        const changes: Changes = {};
                        for (const item of all().filter(
                          (item) => isTask(item) && inTrash(item, all()),
                        ))
                          Object.assign(changes, deleteTree(item, all()));
                        const deleted = new Set(Object.keys(changes));
                        for (const copy of all().filter(
                          (copy) =>
                            !deleted.has(copy.id) &&
                            refs(copy, "rt").some((id) => deleted.has(id)),
                        ))
                          Object.assign(
                            changes,
                            event(copy, {
                              rt: refs(copy, "rt").filter(
                                (id) => !deleted.has(id),
                              ),
                            }),
                          );
                        await mutate(changes, true, false);
                        setUndo(null);
                        setSelected("");
                      },
                    )
                  }
                >
                  <Trash2 size={14} />
                  Empty Trash
                </Button>
              </Show>
              <Show
                when={!loading()}
                fallback={
                  <div class="empty flex min-h-80 flex-col items-center justify-center text-center text-quiet [&.symbol-only]:pointer-events-none [&.symbol-only]:absolute [&.symbol-only]:inset-0 [&.symbol-only]:min-h-0 [&.symbol-only_.empty-symbol]:m-0 [&.symbol-only_.empty-symbol]:size-21 [&.symbol-only_.empty-symbol]:text-muted [&.symbol-only_.empty-symbol]:opacity-15 [&>h2]:mb-3 [&>h2]:font-serif [&>h2]:text-3xl [&>h2]:font-medium [&>h2]:text-muted [&>p]:max-w-80 [&>p]:text-xs [&>p]:leading-relaxed">
                    <span class="loader m-5 size-5 animate-spin rounded-full border-2 border-quiet border-t-accent" />
                    Opening your workspace…
                  </div>
                }
              >
                <Show
                  when={
                    items().length ||
                    (list() === "Upcoming" && upcomingCalendar())
                  }
                  fallback={
                    <div
                      class="empty flex min-h-80 flex-col items-center justify-center text-center text-quiet [&.symbol-only]:pointer-events-none [&.symbol-only]:absolute [&.symbol-only]:inset-0 [&.symbol-only]:min-h-0 [&.symbol-only_.empty-symbol]:m-0 [&.symbol-only_.empty-symbol]:size-21 [&.symbol-only_.empty-symbol]:text-muted [&.symbol-only_.empty-symbol]:opacity-15 [&>h2]:mb-3 [&>h2]:font-serif [&>h2]:text-3xl [&>h2]:font-medium [&>h2]:text-muted [&>p]:max-w-80 [&>p]:text-xs [&>p]:leading-relaxed"
                      classList={{ "symbol-only": !query() }}
                      role="status"
                      aria-label={
                        query()
                          ? "No matching to-dos"
                          : `${current() ? title(current()!) : list()} is empty`
                      }
                    >
                      <div class="empty-symbol mb-3 grid size-16 place-items-center rounded-full text-mint opacity-75 [&>svg]:stroke-1">
                        <Dynamic
                          component={
                            query()
                              ? Search
                              : navIcons[
                                  lists.findIndex((name) => name === list())
                                ] || Inbox
                          }
                          size={84}
                          fill={list() === "Today" ? "currentColor" : "none"}
                        />
                      </div>
                      <Show when={query()}>
                        <h2>Nothing found</h2>
                        <p>Try a different title or a few words from a note.</p>
                      </Show>
                    </div>
                  }
                >
                  <div class="task-list" role="list" aria-label="To-dos">
                    <For each={sections().map((section) => section.id)}>
                      {(sectionId) => {
                        const section = () =>
                          sections().find(
                            (section) => section.id === sectionId,
                          ) || {
                            id: sectionId,
                            label: "",
                            rows: [] as Entity[],
                            day: undefined as number | undefined,
                            container: undefined as Entity | undefined,
                          };
                        return (
                          <>
                            <Show when={section().day}>
                              <ListHeading class="upcoming-day items-baseline gap-2 border-b-0 pb-0 text-sm font-medium text-muted after:h-px after:flex-1 after:bg-hover">
                                <span class="text-2xl font-semibold leading-none text-ink tabular-nums">
                                  {new Date(section().day! * 1000).getUTCDate()}
                                </span>
                                <span>
                                  {section().day === today() + 86400
                                    ? "Tomorrow"
                                    : new Date(
                                        section().day! * 1000,
                                      ).toLocaleDateString("en", {
                                        weekday: "long",
                                        timeZone: "UTC",
                                      })}
                                </span>
                                <span class="sr-only">
                                  {new Date(
                                    section().day! * 1000,
                                  ).toLocaleDateString("en", {
                                    month: "short",
                                    timeZone: "UTC",
                                  })}
                                </span>
                              </ListHeading>
                              <Show when={!section().rows.length}>
                                <div
                                  class="min-h-8"
                                  aria-label={`No to-dos on ${date(section().day)}`}
                                />
                              </Show>
                            </Show>
                            <Show when={section().label}>
                              <ListHeading
                                class="anytime-group-heading"
                                level={
                                  section().container?.kind.startsWith("Area")
                                    ? "area"
                                    : "project"
                                }
                              >
                                <span class="grid w-4 shrink-0 place-items-center">
                                  <Show
                                    when={section().container}
                                    fallback={
                                      <Layers size={16} class="text-anytime" />
                                    }
                                  >
                                    <EntityIcon
                                      item={section().container!}
                                      all={all()}
                                    />
                                  </Show>
                                </span>
                                <Show
                                  when={section().container}
                                  fallback={<span>{section().label}</span>}
                                >
                                  <Button
                                    variant="bare"
                                    class="min-w-0 justify-start truncate text-left"
                                    onClick={() => navigate(section().id)}
                                  >
                                    {section().label}
                                  </Button>
                                </Show>
                              </ListHeading>
                            </Show>
                            <For
                              each={
                                list() === "Anytime" &&
                                !expandedGroups().includes(section().id)
                                  ? section().rows.slice(0, 3)
                                  : section().rows
                              }
                            >
                              {(item, index) => (
                                <>
                                  <Show
                                    when={
                                      current() &&
                                      item.props.ss &&
                                      !items()[index() - 1]?.props.ss
                                    }
                                  >
                                    <ListVisibility />
                                  </Show>
                                  <Show
                                    when={
                                      list() !== "Upcoming" &&
                                      group(item) &&
                                      group(item) !==
                                        group(
                                          items()[index() - 1] || {
                                            id: "",
                                            kind: "",
                                            props: {},
                                          },
                                        )
                                    }
                                  >
                                    <ListHeading class="list-group-heading">
                                      {group(item) === "This Evening" && (
                                        <EveningIcon
                                          size={18}
                                          class="text-muted"
                                        />
                                      )}
                                      <span>{group(item)}</span>
                                    </ListHeading>
                                  </Show>
                                  <Show
                                    when={editing() === item.id}
                                    fallback={
                                      <TaskRow
                                        item={item}
                                        all={all()}
                                        selected={selection().includes(item.id)}
                                        isNew={isNewToday(item.id)}
                                        name={editorSaves.drafts
                                          .get(item.id)
                                          ?.read()
                                          .name.trim()}
                                        showContainer={!current()}
                                        dropEdge={
                                          dropTarget()?.id === item.id
                                            ? dropTarget()!.after
                                              ? "after"
                                              : "before"
                                            : undefined
                                        }
                                        focus={() => {
                                          if (
                                            !editing() &&
                                            !selection().includes(item.id)
                                          )
                                            setSelected(item.id);
                                        }}
                                        select={(e) => {
                                          if (
                                            Date.now() >= suppressRowClickUntil
                                          )
                                            selectItem(item, e);
                                        }}
                                        open={(e) => {
                                          if (
                                            Date.now() < suppressRowClickUntil
                                          )
                                            return;
                                          if (
                                            e.metaKey ||
                                            e.ctrlKey ||
                                            e.shiftKey
                                          )
                                            selectItem(item, e);
                                          else openItem(item);
                                        }}
                                        complete={(cancel) =>
                                          void run(() => complete(item, cancel))
                                        }
                                        context={(e) => openTaskMenu(item, e)}
                                        dragStart={(e) => {
                                          setDragging(item.id);
                                          if (!selection().includes(item.id))
                                            setSelected(item.id);
                                          if (e.dataTransfer) {
                                            e.dataTransfer.effectAllowed =
                                              "move";
                                            e.dataTransfer.setData(
                                              "text/plain",
                                              item.id,
                                            );
                                          }
                                        }}
                                        dragEnd={() => {
                                          setDragging("");
                                          setDropTarget(null);
                                          suppressRowClickUntil =
                                            Date.now() + 250;
                                        }}
                                        dragOver={(e) => {
                                          e.preventDefault();
                                          if (e.dataTransfer)
                                            e.dataTransfer.dropEffect = "move";
                                          const r =
                                            e.currentTarget.getBoundingClientRect();
                                          setDropTarget({
                                            id: item.id,
                                            after:
                                              e.clientY > r.y + r.height / 2,
                                          });
                                        }}
                                        dragLeave={(e) => {
                                          if (
                                            !e.currentTarget.contains(
                                              e.relatedTarget as Node,
                                            )
                                          )
                                            setDropTarget(null);
                                        }}
                                        drop={(e) => rowDrop(e, item)}
                                        schedule={
                                          <DatePicker
                                            compact
                                            iconOnly
                                            kind="when"
                                            reminder={
                                              pref("reminders", {})[
                                                state().account + ":" + item.id
                                              ] || ""
                                            }
                                            changeReminder={(value) =>
                                              void saveReminder(item, value)
                                            }
                                            value={date(
                                              item.props.sr || item.props.tir,
                                            )}
                                            mode={
                                              isSomeday(item)
                                                ? "Someday"
                                                : item.props.sr ||
                                                    item.props.tir
                                                  ? "Date"
                                                  : item.props.st
                                                    ? "Anytime"
                                                    : "Inbox"
                                            }
                                            change={(value, mode) =>
                                              void patch(
                                                item,
                                                schedule(mode || "Date", value),
                                              )
                                            }
                                          />
                                        }
                                      />
                                    }
                                  >
                                    <Show
                                      when={isHeading(item)}
                                      fallback={<Editor item={item} />}
                                    >
                                      <HeadingEditor item={item} />
                                    </Show>
                                  </Show>
                                </>
                              )}
                            </For>
                            <Show
                              when={
                                list() === "Anytime" &&
                                section().rows.length > 3
                              }
                            >
                              <Button
                                size="compact"
                                variant="quiet"
                                align="content"
                                class="mt-1 text-sm text-muted"
                                onClick={() =>
                                  setExpandedGroups((ids) =>
                                    ids.includes(section().id)
                                      ? ids.filter((id) => id !== section().id)
                                      : [...ids, section().id],
                                  )
                                }
                              >
                                {expandedGroups().includes(section().id)
                                  ? "Show less"
                                  : `Show ${section().rows.length - 3} more`}
                              </Button>
                            </Show>
                          </>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </Show>
              <Show
                when={current() && !items().some((item) => !!item.props.ss)}
              >
                <ListVisibility />
              </Show>
            </section>
            <footer class="list-footer relative order-2 flex h-12 shrink-0 items-center justify-center gap-3 border-t border-hover px-4 text-xs text-quiet">
              <span class="sr-only" aria-live="polite">
                {selection().length} item{selection().length === 1 ? "" : "s"}{" "}
                selected
              </span>
              <div ref={setEditorFooter} class="editor-footer-slot contents" />
              <Show when={!editing() || !editorActions()}>
                <ActionBar class="footer-actions">
                  <IconButton
                    size="compact"
                    variant="quiet"
                    class="footer-add text-accent"
                    aria-label="New to-do"
                    title="New to-do (⌘ N)"
                    onClick={() => beginCreate("To-Do")}
                  >
                    <Plus size={18} />
                  </IconButton>
                  <div class="footer-schedule">
                    <Show
                      when={chosen() && !editing()}
                      fallback={
                        <IconButton
                          size="compact"
                          variant="quiet"
                          aria-label="Schedule selected item"
                          disabled={!chosen() || isHeading(chosen()!)}
                          onClick={() =>
                            document
                              .querySelector<HTMLButtonElement>(
                                '.task-editor [aria-label="When"]',
                              )
                              ?.click()
                          }
                        >
                          <CalendarDays size={16} />
                        </IconButton>
                      }
                    >
                      <DatePicker
                        iconOnly
                        compact
                        kind="when"
                        value={date(chosen()?.props.sr || chosen()?.props.tir)}
                        reminder={
                          chosen()
                            ? pref("reminders", {})[
                                `${state().account}:${chosen()!.id}`
                              ] || ""
                            : ""
                        }
                        changeReminder={(value) =>
                          chosen() && void saveReminder(chosen()!, value)
                        }
                        change={(value, mode) =>
                          void patchSelection(schedule(mode || "Date", value))
                        }
                      />
                    </Show>
                  </div>
                  <IconButton
                    size="compact"
                    variant="quiet"
                    aria-label="Move selected item"
                    disabled={!chosen() || isHeading(chosen()!)}
                    onClick={() =>
                      editing() ? editorActions()?.move() : setMoving(true)
                    }
                  >
                    <ArrowRight size={16} />
                  </IconButton>
                  <IconButton
                    size="compact"
                    variant="quiet"
                    aria-label="Quick Find"
                    onClick={() => openFind()}
                  >
                    <Search size={16} />
                  </IconButton>
                </ActionBar>
                <Show when={chosen()}>
                  <div class="footer-selection-actions absolute right-3.5 flex gap-1">
                    <IconButton
                      size="compact"
                      variant="quiet"
                      aria-label="Trash selected item"
                      onClick={() => void removeSelection()}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                    <IconButton
                      size="compact"
                      variant="quiet"
                      aria-label="Selected item actions"
                      onClick={() =>
                        editing()
                          ? editorActions()?.more()
                          : openTaskMenu(chosen()!)
                      }
                    >
                      <MoreHorizontal size={17} />
                    </IconButton>
                  </div>
                </Show>
                <Show when={undo() && !chosen()}>
                  <Button
                    size="compact"
                    variant="quiet"
                    class="footer-undo absolute left-3"
                    onClick={() =>
                      void run(async () => {
                        await mutate(undo()!, true, false);
                        setUndo(null);
                      })
                    }
                  >
                    Undo
                  </Button>
                </Show>
              </Show>
            </footer>
          </Show>
          <Show when={notice()}>
            <div
              role="status"
              class="toast floating-surface z-100 order-1 mx-6 mb-3 flex w-95 max-w-[calc(100%_-_--spacing(8))] shrink-0 items-start gap-3 self-end rounded-xl bg-ink/7 p-4 text-sm leading-relaxed text-ink shadow-xl backdrop-blur-xl [&>p]:min-w-0 [&>p]:flex-1 [&>p]:pt-0.5 [&>p]:wrap-anywhere [&_svg]:text-mint [&_.icon-button_svg]:text-muted"
              onMouseEnter={pauseNotice}
              onMouseLeave={resumeNotice}
              onFocusIn={pauseNotice}
              onFocusOut={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  resumeNotice();
              }}
            >
              <span class="toast-mark grid size-7 shrink-0 place-items-center">
                <Check size={18} />
              </span>
              <p>{notice()}</p>
              <IconButton
                size="compact"
                variant="quiet"
                aria-label="Dismiss notification"
                onClick={() => {
                  pauseNotice();
                  setNotice("");
                }}
              >
                <X size={16} />
              </IconButton>
            </div>
          </Show>
        </main>
        <Show when={taskMenu() && chosen()}>
          <MenuPopup
            label="Task actions"
            point={taskMenu()!}
            close={closeTaskMenu}
          >
            <TaskMenu
              multiple={selection().length > 1}
              project={isProject(chosen()!)}
              inProject={selectedItems().some(
                (item) => refs(item, "pr").length > 0,
              )}
              close={closeTaskMenu}
              action={taskAction}
            />
          </MenuPopup>
        </Show>
        <Show when={batchEdit()}>
          <BatchTaskEdit />
        </Show>
        <Show when={infoItem()}>
          <Dialog title="To-Do Info" close={() => setInfoItem(null)}>
            <p class="mb-5 text-base font-medium">{title(infoItem()!)}</p>
            <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
              <For
                each={[
                  ["Created", infoItem()!.props.cd],
                  ["Modified", infoItem()!.props.md],
                  ["Completed", infoItem()!.props.sp],
                ]}
              >
                {([label, timestamp]) => (
                  <Show when={timestamp}>
                    <dt class="text-muted">{label}</dt>
                    <dd>
                      {new Date(Number(timestamp) * 1000).toLocaleString()}
                    </dd>
                  </Show>
                )}
              </For>
              <dt class="text-muted">In</dt>
              <dd>{container(infoItem()!, all()) || "No Project"}</dd>
            </dl>
          </Dialog>
        </Show>
        <Show when={findOpen()}>
          <QuickFind />
        </Show>
        <Show when={creating()}>
          <CreateDialog />
        </Show>
        <Show when={moving() && chosen()}>
          <Dialog title="Move to…" compact close={() => setMoving(false)}>
            <DestinationPicker
              all={all()}
              item={chosen()!}
              selected={
                refs(chosen()!, "agr")[0] ||
                refs(chosen()!, "pr")[0] ||
                refs(chosen()!, "ar")[0]
              }
              choose={(dest, inbox) =>
                void run(async () => {
                  const changes: Changes = {};
                  for (const item of selectedItems()) {
                    Object.assign(
                      changes,
                      event(item, {
                        ...move(item, dest),
                        ...(!dest
                          ? inbox
                            ? schedule("Inbox")
                            : { st: item.props.st || 1 }
                          : {}),
                      }),
                    );
                    if (isHeading(item) && dest && isProject(dest))
                      for (const child of all().filter((child) =>
                        refs(child, "agr").includes(item.id),
                      ))
                        Object.assign(changes, event(child, { pr: [dest.id] }));
                  }
                  await mutate(changes);
                  setMoving(false);
                })
              }
            />
          </Dialog>
        </Show>
        <Show when={connectionOpen()}>
          <CloudConnection
            connected={(next) => {
              setState(next);
              setConnectionOpen(false);
              setError("");
            }}
            close={() => {
              setConnectionOpen(false);
              const preferences = { ...state().preferences, welcomeSeen: true };
              void run(async () => {
                await call("preferences", { value: preferences });
                setState((s) => ({ ...s, preferences }));
              });
            }}
          />
        </Show>
        <Show when={confirm()}>
          <Dialog
            title="Please confirm"
            close={() => {
              if (!confirming()) setConfirm(null);
            }}
          >
            <p class="confirm-text text-sm leading-relaxed text-muted">
              {confirm()!.text}
            </p>
            <div class="dialog-actions -mx-1 mt-6 flex flex-wrap justify-end gap-2 p-1">
              <Button disabled={confirming()} onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                class="danger bg-danger/10 text-danger"
                disabled={confirming()}
                onClick={() => {
                  if (confirming()) return;
                  setConfirming(true);
                  void run(async () => {
                    await confirm()!.action();
                    setConfirm(null);
                  }).finally(() => setConfirming(false));
                }}
              >
                {confirming() ? "Working…" : "Confirm"}
              </Button>
            </div>
          </Dialog>
        </Show>
      </div>
    </FeedbackContext.Provider>
  );
  function dropIn(e: DragEvent, target: Entity) {
    e.preventDefault();
    e.stopPropagation();
    const item = all().find(
      (x) => x.id === e.dataTransfer?.getData("text/plain"),
    );
    if (!item || item.id === target.id || editing()) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    if (item.kind.startsWith("Area") && target.kind.startsWith("Area"))
      void run(() => mutate(orderBefore(areas(), item, target, after)));
    else if (isProject(item) && isProject(target)) {
      const scope = projects().filter(
        (p) => refs(p, "ar")[0] === refs(target, "ar")[0] || p.id === item.id,
      );
      const changes = orderBefore(scope, item, target, after);
      if (!changes[item.id]) return;
      Object.assign(changes[item.id].p, {
        ar: refs(target, "ar"),
        pr: [],
        agr: [],
      });
      void run(() => mutate(changes));
    } else if (
      !item.kind.startsWith("Area") &&
      !(isProject(item) && isProject(target))
    )
      void patch(item, move(item, target));
  }
  function ProjectNav(props: { p: Entity }) {
    return (
      <NavigationItem
        class="project-nav"
        draggable="true"
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer?.setData("text/plain", props.p.id);
        }}
        classList={{ active: list() === props.p.id }}
        onClick={() => navigate(props.p.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => dropIn(e, props.p)}
      >
        <ProjectProgress project={props.p} />
        <span class="sidebar-label block min-w-0 truncate">
          {title(props.p)}
        </span>
      </NavigationItem>
    );
  }
  function ProjectProgress(props: { project: Entity }) {
    return <ProjectProgressIcon project={props.project} all={all()} />;
  }
  function ListVisibility() {
    const count = () =>
      visible(all(), list(), "", "", true).filter((item) => !!item.props.ss)
        .length;
    return (
      <div class="list-visibility mt-7 flex flex-col items-start gap-2 border-t border-hover pt-3 [&>button]:-ml-4 [&>button]:min-h-7 [&>button]:text-sm [&>button]:text-muted">
        <Button
          variant="quiet"
          aria-pressed={!showLater()}
          onClick={() => setShowLater((value) => !value)}
        >
          {showLater() ? "Hide" : "Show"} later items
        </Button>
        <Button
          variant="quiet"
          aria-label={`${showLogged() ? "Hide" : "Show"} logged items`}
          aria-pressed={showLogged()}
          onClick={() => setShowLogged((value) => !value)}
        >
          {showLogged() ? "Hide" : `Show ${count()}`} logged items
        </Button>
      </div>
    );
  }
  function BatchTaskEdit() {
    const [sharedTags, setSharedTags] = createSignal(
      tags()
        .filter((tag) =>
          selectedItems().every((item) => refs(item, "tg").includes(tag.id)),
        )
        .map((tag) => tag.id),
    );
    return (
      <Dialog
        title={`${batchEdit() === "tags" ? "Tags" : batchEdit() === "when" ? "When" : "Deadline"} · ${selection().length} to-dos`}
        close={() => setBatchEdit(null)}
      >
        <Show
          when={batchEdit() === "tags"}
          fallback={
            <DatePicker
              kind={batchEdit() === "when" ? "when" : "deadline"}
              value=""
              change={(value, mode) => {
                void patchSelection(
                  batchEdit() === "when"
                    ? schedule(mode || "Date", value)
                    : { dd: value ? day(value) : null },
                );
                setBatchEdit(null);
              }}
            />
          }
        >
          <TagPicker
            tags={tags()}
            selected={sharedTags()}
            create={createTag}
            change={(ids) => {
              const removed = sharedTags().filter((id) => !ids.includes(id)),
                added = ids.filter((id) => !sharedTags().includes(id));
              setSharedTags(ids);
              void patchSelection((item) => ({
                tg: [
                  ...new Set([
                    ...refs(item, "tg").filter((id) => !removed.includes(id)),
                    ...added,
                  ]),
                ],
              }));
            }}
          />
        </Show>
      </Dialog>
    );
  }
  function HeadingEditor(props: { item: Entity }) {
    const item = props.item;
    const [name, setName] = createSignal(
      editorSaves.drafts.get(item.id)?.read().name ?? item.props.tt ?? "",
    );
    const read = (): EditorDraft => ({ heading: true, name: name() });
    const session = editorSaves.retain(item, read);
    currentEditor = session;
    let input!: HTMLInputElement;
    onMount(() => {
      input.focus();
      input.select();
    });
    const save = () => {
      const snapshot = read();
      if (!snapshot.name.trim()) return false;
      if (
        snapshot.name.trim() === item.props.tt &&
        all().some((saved) => saved.id === item.id)
      ) {
        discardEditor();
        if (selected() === item.id) setSelected("");
        return Promise.resolve(true);
      }
      return persistEditor(session, async () => {
        await mutate(
          !all().some((saved) => saved.id === item.id)
            ? {
                [item.id]: {
                  e: item.kind,
                  t: 0,
                  p: { ...item.props, tt: snapshot.name.trim() },
                },
              }
            : event(item, { tt: snapshot.name.trim() }),
        );
        if (editorSaves.unchanged(session, snapshot)) {
          batch(() => {
            if (currentEditor === session) setEditing("");
            if (selected() === item.id) setSelected("");
            releaseEditor(session);
          });
        }
        return true;
      });
    };
    onMount(() => (saveEditor = save));
    onCleanup(() => {
      if (currentEditor === session) {
        currentEditor = undefined;
        saveEditor = undefined;
      }
    });
    return (
      <div
        class="heading inline-heading-editor -mx-3 mt-6 mb-2 flex min-h-12 items-center gap-2 rounded-xl bg-surface px-3 py-2 [&>input]:flex-1 [&>input]:bg-transparent [&>input]:px-0 [&>input]:py-1 [&>input]:text-2xl [&>input]:font-semibold [&>input]:text-accent"
        onFocusOut={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            !event.currentTarget.contains(event.relatedTarget)
          )
            void save();
        }}
      >
        <Input
          variant="plain"
          ref={input}
          aria-label="Heading title"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              void save();
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              void save();
            }
          }}
        />
        <Popover
          size="compact"
          iconOnly
          label="Heading actions"
          trigger={<MoreHorizontal size={16} />}
        >
          {(close) => (
            <Menu close={close}>
              <MenuItem
                onClick={() => {
                  close();
                  void run(async () => {
                    if (await save())
                      await mutate(
                        event(item, { ss: 3, sp: Date.now() / 1000 }),
                      );
                  });
                }}
              >
                <Archive size={16} /> Archive
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  void run(async () => {
                    if (await save()) {
                      setSelected(item.id);
                      setMoving(true);
                    }
                  });
                }}
              >
                <ArrowRight size={16} /> Move…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  void run(async () => {
                    if (await save()) {
                      const parent = all().find((parent) =>
                        refs(item, "pr").includes(parent.id),
                      );
                      const changes = event(item, {
                        tp: 1,
                        pr: [],
                        agr: [],
                        ar: parent ? refs(parent, "ar") : [],
                        st: 1,
                      });
                      for (const child of all().filter((child) =>
                        refs(child, "agr").includes(item.id),
                      ))
                        Object.assign(
                          changes,
                          event(child, { pr: [item.id], agr: [] }),
                        );
                      await mutate(changes);
                    }
                  });
                }}
              >
                <Folder size={16} /> Convert to Project…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  void run(async () => {
                    if (!name().trim() || (await save()))
                      await remove(props.item);
                  });
                }}
              >
                <Trash2 size={16} /> Delete
              </MenuItem>
            </Menu>
          )}
        </Popover>
      </div>
    );
  }
  function QuickFind() {
    let input!: HTMLInputElement;
    const destinations = () =>
      [
        ...lists.map((name) => ({
          id: name,
          label: name,
          entity: null as Entity | null,
        })),
        ...areas().map((a) => ({ id: a.id, label: title(a), entity: a })),
        ...projects().map((p) => ({ id: p.id, label: title(p), entity: p })),
      ].filter((x) =>
        x.label.toLowerCase().includes(findQuery().toLowerCase()),
      );
    const results = () =>
      findQuery().trim()
        ? visible(all(), "Inbox", findQuery())
            .filter((e) => !isProject(e) && !isHeading(e))
            .slice(0, 40)
        : [];
    const entries = () =>
      findQuery().trim()
        ? [
            ...destinations().map((d) => ({
              id: d.id,
              label: d.label,
              entity: d.entity,
              item: null as Entity | null,
            })),
            ...results().map((item) => ({
              id: item.id,
              label: title(item),
              item,
              entity: item,
            })),
          ]
        : recentItems().flatMap((id) => {
            const item = all().find((item) => item.id === id);
            if (lists.includes(id as any))
              return [
                {
                  id,
                  label: id,
                  item: null as Entity | null,
                  entity: null as Entity | null,
                },
              ];
            return item
              ? [
                  {
                    id,
                    label: title(item),
                    item:
                      isProject(item) || item.kind.startsWith("Area")
                        ? null
                        : item,
                    entity: item,
                  },
                ]
              : [];
          });
    function choose(index: number) {
      const entry = entries()[index];
      if (!entry) return;
      setFindOpen(false);
      setSettings(false);
      if (!entry.item) {
        navigate(entry.id);
        return;
      }
      const item = entry.item;
      const heading = all().find((e) => e.id === refs(item, "agr")[0]);
      setList(
        trashed(item)
          ? "Trash"
          : item.props.ss
            ? "Logbook"
            : refs(item, "pr")[0] ||
              refs(item, "ar")[0] ||
              (heading && refs(heading, "pr")[0]) ||
              (item.props.st === 0
                ? "Inbox"
                : later(item)
                  ? item.props.sr || item.props.tir
                    ? "Upcoming"
                    : "Someday"
                  : "Anytime"),
      );
      setTag("");
      setShowLater(true);
      setSelected(item.id);
      setEditing(item.id);
    }
    onMount(() => input.focus());
    return (
      <Dialog title="Quick Find" compact close={() => setFindOpen(false)}>
        <div
          class="quick-find"
          onKeyDown={(e) => {
            if (["ArrowDown", "ArrowUp"].includes(e.key)) {
              e.preventDefault();
              setFindIndex((i) =>
                Math.max(
                  0,
                  Math.min(
                    entries().length - 1,
                    i + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
              document
                .getElementById(`find-result-${findIndex()}`)
                ?.scrollIntoView({ block: "nearest" });
            }
            if (e.key === "Enter") {
              e.preventDefault();
              choose(findIndex());
            }
          }}
        >
          <div class="find-input flex items-center gap-2 rounded-full bg-hover px-3 text-muted">
            <Search size={15} />
            <Input
              variant="plain"
              class="min-h-8 px-0 py-0 text-sm"
              ref={input}
              aria-label="Quick Find query"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls="find-results"
              aria-activedescendant={
                entries().length ? `find-result-${findIndex()}` : undefined
              }
              placeholder="Quick Find"
              value={findQuery()}
              onInput={(e) => {
                setFindQuery(e.currentTarget.value);
                setFindIndex(0);
              }}
            />
          </div>
          <Show when={!findQuery().trim()}>
            <h3 class="mt-4 mb-1 border-b border-hover px-1 pb-2 text-xs font-medium text-muted">
              Recent
            </h3>
          </Show>
          <div
            id="find-results"
            class="find-results my-2 max-h-[50dvh] overflow-auto [&>button]:min-h-7 [&>button]:w-full [&>button]:justify-start [&>button]:gap-2 [&>button]:rounded-md [&>button]:px-2 [&>button]:py-1 [&>button]:text-left [&>button]:text-xs [&>button>span]:min-w-0 [&>button>span]:truncate [&>button>svg]:shrink-0 [&_small]:ml-auto [&_small]:max-w-24 [&_small]:truncate [&_small]:text-quiet [&_.find-active]:bg-selection"
            role="listbox"
            aria-label="Quick Find results"
          >
            <For each={entries()}>
              {(entry, i) => (
                <Button
                  variant="bare"
                  role="option"
                  aria-label={entry.label}
                  id={`find-result-${i()}`}
                  aria-selected={findIndex() === i()}
                  classList={{ "find-active": findIndex() === i() }}
                  onPointerMove={() => setFindIndex(i())}
                  onClick={() => choose(i())}
                >
                  <Show
                    when={entry.entity}
                    fallback={<ListIcon name={entry.id} />}
                  >
                    <EntityIcon item={entry.entity!} all={all()} />
                  </Show>
                  <span>{entry.label}</span>
                  <Show when={entry.item}>
                    <small>{container(entry.item!, all())}</small>
                  </Show>
                  <Show
                    when={
                      entry.id === "Inbox" && visible(all(), "Inbox").length
                    }
                  >
                    <small>{visible(all(), "Inbox").length}</small>
                  </Show>
                  <Show when={!entry.item && entry.id === list()}>
                    <Check size={14} class="ml-auto text-accent" />
                  </Show>
                </Button>
              )}
            </For>
          </div>
          <Show when={!entries().length}>
            <p class="muted text-muted">No matching lists or to-dos.</p>
          </Show>
          <p class="find-hint px-4 pt-4 pb-2 text-center text-xs leading-relaxed text-quiet">
            Quickly switch lists, find to-dos
            <br />
            or search for tags…
          </p>
        </div>
      </Dialog>
    );
  }
  function CreateDialog() {
    const [name, setName] = createSignal(
        creating() === "Rename" ? title(current()!) : "",
      ),
      [kind, setKind] = createSignal(creating()!),
      [destination, setDestination] = createSignal(current()?.id || ""),
      [saving, setSaving] = createSignal(false);
    async function submit(ev: SubmitEvent) {
      ev.preventDefault();
      if (!name().trim() || saving()) return;
      setSaving(true);
      await run(async () => {
        if (kind() === "Rename") {
          await mutate(event(current()!, { tt: name().trim() }));
          beginCreate(null);
          return;
        }
        const dest = all().find((e) => e.id === destination());
        let props: Props = { tt: name().trim() };
        if (kind() === "Heading" && (!dest || !isProject(dest)))
          throw Error("Choose a project for this heading.");
        if (
          kind() === "To-Do" ||
          kind() === "Heading" ||
          kind() === "Project"
        ) {
          props = {
            ...props,
            tp: kind() === "Project" ? 1 : kind() === "Heading" ? 2 : 0,
            ...(dest
              ? move({ id: "", kind: "Task6", props: {} }, dest)
              : schedule(
                  ["Today", "Someday", "Anytime"].includes(list())
                    ? list()
                    : pref("defaultList", "Inbox"),
                )),
          };
          if (
            kind() === "Project" &&
            !dest &&
            !["Today", "Someday"].includes(list())
          )
            Object.assign(props, schedule("Anytime"));
          if (kind() === "Heading") props.pr = [dest!.id];
        }
        const changes = create(
          kind() === "Area" ? "Area3" : kind() === "Tag" ? "Tag4" : "Task6",
          props,
        );
        const id = Object.keys(changes)[0];
        await mutate(changes);
        beginCreate(null);
        if (kind() === "Project" || kind() === "Area") navigate(id);
        else {
          setSelected(id);
          if (kind() === "To-Do") setEditing(id);
        }
      });
      setSaving(false);
    }
    return (
      <Dialog
        title={kind() === "Rename" ? "Rename list" : `New ${kind()}`}
        close={() => beginCreate(null)}
      >
        <form onSubmit={submit}>
          <Field label="Title">
            <Input
              autofocus
              required
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="What’s on your mind?"
            />
          </Field>
          <Show when={kind() !== "Rename"}>
            <div class="field-grid grid grid-cols-2 gap-4 [&>*]:min-w-0">
              <Field label="Kind">
                <Select
                  value={kind()}
                  onChange={(e) => setKind(e.currentTarget.value)}
                >
                  <For each={["To-Do", "Project", "Area", "Heading", "Tag"]}>
                    {(k) => <option>{k}</option>}
                  </For>
                </Select>
              </Field>
              <Show when={["To-Do", "Project", "Heading"].includes(kind())}>
                <Field label="In">
                  <Select
                    value={destination()}
                    onChange={(e) => setDestination(e.currentTarget.value)}
                  >
                    <option value="">
                      {["Today", "Anytime", "Someday"].includes(list())
                        ? list()
                        : "Inbox"}
                    </option>
                    <For
                      each={[...areas(), ...projects()]
                        .filter((x) => kind() !== "Heading" || isProject(x))
                        .filter(
                          (x) =>
                            kind() !== "Project" || x.kind.startsWith("Area"),
                        )}
                    >
                      {(d) => <option value={d.id}>{title(d)}</option>}
                    </For>
                  </Select>
                </Field>
              </Show>
            </div>
          </Show>
          <div class="dialog-actions -mx-1 mt-6 flex flex-wrap justify-end gap-2 p-1">
            <Button onClick={() => beginCreate(null)}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!name().trim() || saving()}
            >
              {saving() ? "Saving…" : kind() === "Rename" ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </Dialog>
    );
  }
  function Editor(props: { item: Entity }) {
    const item = props.item;
    const previous = editorSaves.drafts.get(item.id)?.read();
    const restored = previous && !previous.heading ? previous : undefined;
    const instant = instantEditor === item.id;
    instantEditor = "";
    const [name, setName] = createSignal(restored?.name ?? item.props.tt ?? ""),
      [notes, setNotes] = createSignal(restored?.notes ?? noteText(item)),
      [previewNotes, setPreviewNotes] = createSignal(false),
      [start, setStart] = createSignal(
        restored?.start ?? date(item.props.sr || item.props.tir),
      ),
      [mode, setMode] = createSignal(
        restored?.mode ??
          (item.props.sr === today() || item.props.tir === today()
            ? item.props.sb === 1
              ? "This Evening"
              : "Today"
            : item.props.sr || item.props.tir
              ? "Date"
              : item.props.st === 2
                ? "Someday"
                : item.props.st === 1
                  ? "Anytime"
                  : "Inbox"),
      ),
      [deadline, setDeadline] = createSignal(
        restored?.deadline ?? date(item.props.dd),
      ),
      [reminder, setReminder] = createSignal<string>(
        restored?.reminder ??
          pref("reminders", {})[`${state().account}:${item.id}`] ??
          "",
      ),
      [selectedTags, setSelectedTags] = createSignal<string[]>(
        restored?.tags ?? refs(item, "tg"),
      ),
      [tagBusy, setTagBusy] = createSignal(false),
      [repeatRule, setRepeatRule] = createSignal<Props | null>(
        restored?.repeatRule ?? null,
      ),
      [repeatNext, setRepeatNext] = createSignal(restored?.repeatNext ?? ""),
      [repeatOptions, setRepeatOptions] = createSignal<RepeatOptions>(
        restored?.repeatOptions ?? {},
      ),
      [repeatOpen, setRepeatOpen] = createSignal(restored?.repeatOpen ?? false),
      [saving, setSaving] = createSignal(false);
    const [checkRows, setCheckRows] = createStore<CheckRow[]>(
      restored?.checks ??
        all()
          .filter((e) => refs(e, "ts").includes(item.id))
          .sort((a, b) => (a.props.ix || 0) - (b.props.ix || 0))
          .map((e) => ({
            id: e.id,
            kind: e.kind,
            title: title(e),
            done: !!e.props.ss,
          })),
    );
    const checks = () => checkRows;
    const setChecks = (fn: (rows: CheckRow[]) => CheckRow[]) =>
      setCheckRows(reconcile(fn([...checkRows]), { key: "id" }));
    const [status, setStatus] = createSignal<number>(
      restored?.status ?? item.props.ss ?? 0,
    );
    const [destination, setDestination] = createSignal(
      restored?.destination ??
        (refs(item, "agr")[0] ||
          refs(item, "pr")[0] ||
          refs(item, "ar")[0] ||
          ""),
    );
    const repeatId =
      restored?.repeatId ||
      (isTemplate(item) ? item.id : refs(item, "rt")[0]) ||
      uuid();
    let conversion = restored?.convert ?? false;
    const read = (): Extract<EditorDraft, { heading: false }> => ({
      heading: false,
      name: name(),
      notes: notes(),
      start: start(),
      mode: mode(),
      deadline: deadline(),
      reminder: reminder(),
      tags: [...selectedTags()],
      repeatRule: repeatRule(),
      repeatNext: repeatNext(),
      repeatOptions: { ...repeatOptions() },
      repeatOpen: repeatOpen(),
      repeatId,
      checks: checks().map((check) => ({ ...check })),
      status: status(),
      destination: destination(),
      convert: conversion,
    });
    const initialDraft = read();
    const fields = (value: typeof initialDraft, saved: Entity): Props => ({
      tt: value.name.trim(),
      ...(value.convert ? { tp: 1 } : {}),
      nt: value.notes,
      ...move(saved, all().find((e) => e.id === value.destination) || null),
      ...schedule(
        value.mode === "Inbox" && value.destination ? "Anytime" : value.mode,
        value.start,
      ),
      ss: value.status,
      sp: value.status ? saved.props.sp || Date.now() / 1000 : null,
      dd: value.deadline ? day(value.deadline) : null,
      tg: value.tags,
    });
    const initialFields = fields(initialDraft, item);
    const session = editorSaves.retain(item, read);
    currentEditor = session;
    let editor!: HTMLDivElement;
    const [dragCheck, setDragCheck] = createSignal("");
    const reorderCheck = (id: string, direction: number) =>
      setChecks((rows) => {
        const index = rows.findIndex((row) => row.id === id),
          target = index + direction;
        if (index < 0 || target < 0 || target >= rows.length) return rows;
        const next = [...rows];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      });
    onMount(() =>
      setEditorActions({
        move: () =>
          editor
            .querySelector<HTMLButtonElement>(".editor-move > button")
            ?.click(),
        more: () =>
          editor
            .querySelector<HTMLButtonElement>(".editor-more > button")
            ?.click(),
        action: handleAction,
      }),
    );
    onCleanup(() => {
      if (currentEditor === session) setEditorActions(null);
    });
    const focusCheck = (id: string) =>
      queueMicrotask(() =>
        editor
          .querySelector<HTMLInputElement>(
            `[data-check-id="${id}"] input:not([type=checkbox])`,
          )
          ?.focus(),
      );
    function addCheck(after?: string) {
      const next = {
        id: uuid(),
        kind: "ChecklistItem3",
        title: "",
        done: false,
      };
      setChecks((rows) => {
        const copy = [...rows],
          index = after
            ? rows.findIndex((c) => c.id === after) + 1
            : rows.length;
        copy.splice(index, 0, next);
        return copy;
      });
      focusCheck(next.id);
    }
    onMount(() =>
      queueMicrotask(() =>
        editor
          .querySelector<HTMLInputElement>('[aria-label="To-do title"]')
          ?.focus(),
      ),
    );
    const recurring = () => {
      const saved = all().find((e) => e.id === item.id) || item;
      return isTemplate(saved)
        ? saved
        : all().find((e) => e.id === refs(saved, "rt")[0] && !trashed(e));
    };
    function handleAction(action: TaskAction) {
      if (["when", "tags", "deadline"].includes(action)) {
        editor
          .querySelector<HTMLButtonElement>(
            `[aria-label="${action === "when" ? "When" : action === "tags" ? "Tags" : "Deadline"}"]`,
          )
          ?.click();
      } else if (action === "move")
        editor
          .querySelector<HTMLButtonElement>(".editor-move > button")
          ?.click();
      else if (action === "repeat") {
        if (item.props.rp)
          setError(
            "This task uses a newer imported repeating format. Edit its rule in Things; its original schedule is preserved.",
          );
        else setRepeatOpen(true);
      } else if (action === "info") setInfoItem(item);
      else if (action === "convert") void save(true);
      else if (action === "delete") void run(() => remove(item));
      else if (action === "share") void shareTask(name(), notes());
      else if (action === "removeProject")
        setDestination(refs(item, "ar")[0] || "");
      else if (action === "showProject")
        void run(async () => {
          if (await save()) navigate(refs(item, "pr")[0]);
        });
      else if (action === "duplicate")
        void run(async () => {
          if (await save()) {
            const saved = all().find((e) => e.id === item.id);
            if (saved) await duplicate(saved);
          }
        });
      else if (["complete", "cancel", "reopen"].includes(action)) {
        setStatus(action === "complete" ? 3 : action === "cancel" ? 2 : 0);
        void save();
      } else {
        const modes = {
          today: "Today",
          evening: "This Evening",
          anytime: "Anytime",
          someday: "Someday",
        };
        const mode = modes[action as keyof typeof modes];
        if (mode) {
          setMode(mode);
          setStart(
            mode === "Today" || mode === "This Evening" ? date(today()) : "",
          );
        }
      }
    }
    let inFlight: Promise<boolean | undefined> | undefined;
    function save(
      convert = false,
      handoff = false,
    ): Promise<boolean | undefined> | false {
      if (tagBusy()) return false;
      if (saving() && !handoff) return inFlight || false;
      if (
        !name().trim() &&
        (!all().some((saved) => saved.id === item.id) || item.props.tt?.trim())
      ) {
        if (
          !all().some((saved) => saved.id === item.id) &&
          !notes().trim() &&
          !checks().length
        ) {
          discardEditor();
          return Promise.resolve(true);
        }
        setError("Enter a title before saving this to-do.");
        return false;
      }
      conversion ||= convert;
      const snapshot = read();
      if (
        !restored &&
        all().some((saved) => saved.id === item.id) &&
        JSON.stringify(snapshot) === JSON.stringify(initialDraft)
      ) {
        discardEditor();
        return Promise.resolve(true);
      }
      setSaving(true);
      const result = persistEditor(session, async () => {
        const savedItem = all().find((saved) => saved.id === item.id) || item;
        const existingChecks = all().filter((e) =>
          refs(e, "ts").includes(item.id),
        );
        const p = fields(snapshot, savedItem);
        const existing = all().some((saved) => saved.id === item.id);
        if (existing && !restored)
          for (const key of Object.keys(p))
            if (JSON.stringify(p[key]) === JSON.stringify(initialFields[key]))
              delete p[key];
        const changes: Changes = !all().some((saved) => saved.id === item.id)
          ? { [item.id]: { e: item.kind, t: 0, p: { ...item.props, ...p } } }
          : Object.keys(p).length
            ? event(savedItem, p)
            : {};
        for (const c of snapshot.checks) {
          const old = existingChecks.find((e) => e.id === c.id);
          if (c.title.trim()) {
            changes[c.id] = {
              e: c.kind,
              t: old ? 1 : 0,
              p: {
                tt: c.title.trim(),
                ss: c.done ? 3 : 0,
                sp: c.done ? old?.props.sp || Date.now() / 1000 : null,
                ix: snapshot.checks.indexOf(c) * 1024,
                ts: [item.id],
              },
            };
            if (
              old &&
              changes[c.id] &&
              Object.entries(changes[c.id].p).every(
                ([key, value]) =>
                  JSON.stringify(value) ===
                  JSON.stringify(old.props[key] ?? null),
              )
            )
              delete changes[c.id];
          } else if (old) changes[c.id] = { e: old.kind, t: 2, p: {} };
        }
        for (const old of existingChecks)
          if (!snapshot.checks.some((c) => c.id === old.id))
            changes[old.id] = { e: old.kind, t: 2, p: {} };
        if (snapshot.repeatRule) {
          if (savedItem.props.rp)
            throw Error(
              "The original imported repeating schedule must be edited in Things.",
            );
          const rule = snapshot.repeatRule;
          const first = day(
            snapshot.repeatNext || snapshot.start || date(today()),
          );
          const series = recurring();
          if (series && !simpleRule(series.props.rr))
            throw Error(
              "This imported rule cannot be changed safely; the original rule is preserved.",
            );
          const waiting =
            rule.tp === 1 &&
            series &&
            all().some(
              (copy) =>
                refs(copy, "rt").includes(series.id) &&
                !copy.props.ss &&
                !trashed(copy),
            );
          const ruleFields = {
            rr: rule,
            sr: waiting ? null : first,
            tir: waiting ? null : first,
            dd:
              snapshot.repeatOptions.deadlineOffset === undefined
                ? null
                : first + snapshot.repeatOptions.deadlineOffset * 86400,
          };
          if (series) {
            changes[series.id] ||= { e: series.kind, t: 1, p: {} };
            Object.assign(changes[series.id].p, ruleFields);
          } else {
            changes[snapshot.repeatId] = {
              e: "Task6",
              t: 0,
              p: {
                ...savedItem.props,
                ...fields(snapshot, savedItem),
                ...ruleFields,
                ss: 0,
                sp: null,
                tr: false,
                rt: [],
                icsd: first,
                icp: false,
              },
            };
            changes[item.id] ||= { e: item.kind, t: 1, p: {} };
            Object.assign(changes[item.id].p, {
              rt: [snapshot.repeatId],
              sr: first,
              tir: first,
              st: first > today() ? 2 : 1,
            });
            for (const check of snapshot.checks.filter((check) =>
              check.title.trim(),
            ))
              Object.assign(
                changes,
                create(check.kind, {
                  tt: check.title.trim(),
                  ts: [snapshot.repeatId],
                  ss: 0,
                  ix: snapshot.checks.indexOf(check) * 1024,
                }),
              );
          }
        }
        if (Object.keys(changes).length) await mutate(changes, true);
        if (snapshot.repeatRule) {
          const repeatOptions = {
            ...pref("repeatOptions", {}),
            [`${state().account}:${snapshot.repeatId}`]: snapshot.repeatOptions,
          };
          const preferences = { ...state().preferences, repeatOptions };
          await call("preferences", { value: preferences });
          setState((state) => ({ ...state, preferences }));
        }
        const reminderKey = `${state().account}:${item.id}`;
        if ((pref("reminders", {})[reminderKey] || "") !== snapshot.reminder) {
          const reminders = { ...pref("reminders", {}) };
          if (snapshot.reminder) reminders[reminderKey] = snapshot.reminder;
          else delete reminders[reminderKey];
          const preferences = { ...state().preferences, reminders };
          await call("preferences", { value: preferences });
          setState((s) => ({ ...s, preferences }));
        }
        if (editorSaves.unchanged(session, snapshot)) {
          const close = currentEditor === session;
          batch(() => {
            if (close) setEditing("");
            releaseEditor(session);
          });
          if (snapshot.convert && close) navigate(item.id);
        }
        scheduleSync();
        return true;
      });
      inFlight = result;
      void result.then(() => {
        if (inFlight === result) setSaving(false);
      });
      return result;
    }
    onMount(() => (saveEditor = (handoff) => save(false, handoff)));
    onCleanup(() => {
      if (currentEditor === session) {
        currentEditor = undefined;
        saveEditor = undefined;
      }
    });
    // Matching margin and padding extend the surface without moving its content.
    return (
      <div
        class="task-editor relative -ml-6.5 -mr-3 mb-4 flex flex-col gap-2 rounded-xl bg-surface pl-6.5 pr-3 py-5 shadow-xl outline-none [&_[hidden]]:hidden [&_:is(input,textarea,button,summary)]:scroll-my-4"
        data-instant={instant || undefined}
        ref={editor}
        role="group"
        aria-label={`Edit ${title(item)}`}
        onKeyDown={(e) => {
          if (
            (e.metaKey || e.ctrlKey) &&
            e.shiftKey &&
            e.key.toLowerCase() === "c"
          ) {
            e.preventDefault();
            e.stopPropagation();
            addCheck();
            return;
          }
          if (
            (e.metaKey || e.ctrlKey) &&
            e.shiftKey &&
            e.key.toLowerCase() === "t"
          ) {
            e.preventDefault();
            e.stopPropagation();
            editor
              .querySelector<HTMLButtonElement>('[aria-label="Tags"]')
              ?.click();
            return;
          }
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void save();
          }
          if (
            e.key === "Escape" &&
            !e.defaultPrevented &&
            !(e.target as HTMLElement).closest("[role=listbox]")
          ) {
            e.stopPropagation();
            discardEditor();
          }
        }}
      >
        <div class="editor-title grid min-h-7 grid-cols-[--spacing(4)_minmax(0,1fr)] items-center gap-3 [&_input]:min-h-7 [&_input]:h-7 [&_input]:rounded-none [&_input]:px-0 [&_input]:py-0 [&_input]:text-sm [&_input]:font-normal [&_input]:focus-visible:bg-transparent [&_input]:focus-visible:shadow-none">
          <Show
            when={!isTemplate(item)}
            fallback={
              <RotateCw
                size={16}
                class="justify-self-center text-upcoming"
                aria-label="Repeating template"
              />
            }
          >
            <CheckButton
              aria-label={status() ? "Reopen to-do" : "Complete to-do"}
              checked={!!status()}
              canceled={status() === 2}
              dashed={mode() === "Someday"}
              onClick={(e) => setStatus(status() ? 0 : e.altKey ? 2 : 3)}
            />
          </Show>
          <div class="flex min-w-0 items-center gap-2">
            <Show when={isNewToday(item.id)}>
              <span
                class="due-today size-2 shrink-0 rounded-full bg-highlight"
                aria-label="New in Today"
              />
            </Show>
            <Input
              variant="plain"
              autofocus
              aria-label="To-do title"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="New to-do"
            />
          </div>
        </div>
        <div class="editor-notes-block ml-7 min-w-0">
          <Show
            when={previewNotes()}
            fallback={
              <Textarea
                variant="plain"
                autosize
                class="editor-notes min-h-14 w-full rounded-lg px-0 py-1 text-sm leading-relaxed text-muted"
                aria-label="Notes"
                placeholder="Notes"
                value={notes()}
                onInput={(e) => setNotes(e.currentTarget.value)}
              />
            }
          >
            <Markdown text={notes()} onError={setError} />
          </Show>
        </div>
        <div class="checklist ml-7 flex flex-col" hidden={!checks().length}>
          <For each={checks()}>
            {(c) => (
              <div
                class="check-row group/check flex min-w-0 items-center gap-3 border-b border-hover first:border-t [&>input]:min-h-9 [&>input]:flex-1 [&>input]:rounded-lg [&>input]:px-0 [&>input]:py-2 [&>input]:text-sm [&>button[aria-checked=true]+input]:text-quiet [&>button[aria-checked=true]+input]:line-through"
                data-check-id={c.id}
                onDragOver={(e) => {
                  if (dragCheck()) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const id =
                    dragCheck() ||
                    e.dataTransfer?.getData("application/x-somedue-checklist");
                  setDragCheck("");
                  if (!id || id === c.id) return;
                  const rect = e.currentTarget.getBoundingClientRect(),
                    after = e.clientY > rect.top + rect.height / 2;
                  setChecks((rows) => {
                    const moved = rows.find((row) => row.id === id);
                    if (!moved) return rows;
                    const next = rows.filter((row) => row.id !== id);
                    next.splice(
                      next.findIndex((row) => row.id === c.id) + Number(after),
                      0,
                      moved,
                    );
                    return next;
                  });
                }}
              >
                <CheckButton
                  role="checkbox"
                  aria-label={`Complete checklist ${c.title}`}
                  aria-checked={c.done}
                  checked={c.done}
                  onClick={() =>
                    setChecks((v) =>
                      v.map((x) =>
                        x.id === c.id ? { ...x, done: !x.done } : x,
                      ),
                    )
                  }
                />
                <Input
                  variant="plain"
                  aria-label="Checklist item"
                  value={c.title}
                  placeholder="Checklist item"
                  onInput={(e) =>
                    setChecks((v) =>
                      v.map((x) =>
                        x.id === c.id
                          ? { ...x, title: e.currentTarget.value }
                          : x,
                      ),
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.metaKey || e.ctrlKey) return;
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      addCheck(c.id);
                    }
                    if (e.key === "Backspace" && !c.title) {
                      e.preventDefault();
                      const rows = checks(),
                        i = rows.findIndex((x) => x.id === c.id),
                        previous = rows[i - 1]?.id;
                      setChecks((v) => v.filter((x) => x.id !== c.id));
                      if (previous) focusCheck(previous);
                      else
                        editor
                          .querySelector<HTMLInputElement>(
                            '[aria-label="To-do title"]',
                          )
                          ?.focus();
                    }
                    if (e.altKey && ["ArrowUp", "ArrowDown"].includes(e.key)) {
                      e.preventDefault();
                      reorderCheck(c.id, e.key === "ArrowUp" ? -1 : 1);
                      focusCheck(c.id);
                    }
                  }}
                />
                <div class="ml-auto flex items-center gap-1">
                  <IconButton
                    size="compact"
                    variant="quiet"
                    class="opacity-0 group-hover/check:opacity-100 group-focus-within/check:opacity-100"
                    aria-label="Remove checklist item"
                    onClick={() =>
                      setChecks((v) => v.filter((x) => x.id !== c.id))
                    }
                  >
                    <X size={13} />
                  </IconButton>
                  <IconButton
                    size="compact"
                    variant="quiet"
                    class="cursor-grab active:cursor-grabbing"
                    aria-label="Reorder checklist item"
                    title="Drag to reorder · Option ↑ / ↓"
                    draggable="true"
                    onDragStart={(e) => {
                      setDragCheck(c.id);
                      if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData(
                          "application/x-somedue-checklist",
                          c.id,
                        );
                      }
                    }}
                    onDragEnd={() => setDragCheck("")}
                    onKeyDown={(e) => {
                      if (
                        e.altKey &&
                        ["ArrowUp", "ArrowDown"].includes(e.key)
                      ) {
                        e.preventDefault();
                        e.stopPropagation();
                        reorderCheck(c.id, e.key === "ArrowUp" ? -1 : 1);
                      }
                    }}
                  >
                    <GripHorizontal size={16} />
                  </IconButton>
                </div>
              </div>
            )}
          </For>
          <Button
            size="small"
            class="add-check justify-start self-start gap-2.5 py-1.5 [&>svg]:w-4.5"
            onClick={() => addCheck()}
          >
            <Plus size={13} />
            Checklist item
          </Button>
        </div>
        <div class="editor-tools ml-7 mt-3 flex flex-wrap items-center gap-1 [&>*]:min-w-0 [&>.schedule-chip:first-child]:mr-auto">
          <DatePicker
            compact
            clearable
            align="content"
            kind="when"
            reminder={reminder()}
            changeReminder={setReminder}
            mode={mode()}
            value={start()}
            change={(value, mode) => {
              setStart(value);
              setMode(mode || "Date");
            }}
          />
          <TagPicker
            compact
            tags={tags()}
            busyChange={setTagBusy}
            selected={selectedTags()}
            change={setSelectedTags}
            create={createTag}
          />
          <IconButton
            size="compact"
            variant="quiet"
            aria-label="Add checklist item"
            onClick={() => addCheck()}
          >
            <ListChecks size={15} />
          </IconButton>
          <DatePicker
            compact
            clearable
            kind="deadline"
            value={deadline()}
            change={setDeadline}
          />
        </div>
        <Show when={recurring() || repeatRule()}>
          <div class="repeat-panel ml-7 mt-2 text-sm">
            <Popover
              label="Repeating schedule"
              size="compact"
              triggerClass="h-auto min-h-8 w-full justify-start rounded-lg bg-hover px-2 py-2 text-left font-normal"
              trigger={
                <>
                  <RotateCw size={16} class="text-upcoming" />
                  <span class="min-w-0">
                    <Show
                      when={!isTemplate(item)}
                      fallback={
                        <span class="font-medium">
                          {ruleSummary(repeatRule() || recurring()?.props.rr)}
                          <span class="ml-2 text-quiet">
                            {ruleDates(
                              repeatRule() || recurring()?.props.rr,
                              recurring()?.props.sr || undefined,
                            )
                              .map((stamp) =>
                                new Date(stamp * 1000).toLocaleDateString(
                                  "en",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    timeZone: "UTC",
                                  },
                                ),
                              )
                              .join(", ")}
                          </span>
                        </span>
                      }
                    >
                      <span>This is a copy of a repeating to-do</span>
                      <span class="block text-xs text-muted">
                        {ruleSummary(repeatRule() || recurring()?.props.rr)}
                      </span>
                    </Show>
                  </span>
                </>
              }
            >
              {(close) => (
                <Menu close={close}>
                  <MenuItem
                    onClick={() => {
                      setRepeatOpen(true);
                      close();
                    }}
                  >
                    <RotateCw size={16} />
                    Edit Rule…
                  </MenuItem>
                  <hr
                    role="separator"
                    class="mx-2 my-1 border-0 border-t border-quiet/20"
                  />
                  <MenuItem
                    disabled={
                      !recurring() ||
                      !simpleRule(recurring()!.props.rr) ||
                      !recurring()?.props.sr
                    }
                    onClick={() => {
                      close();
                      void run(async () => {
                        if (await save()) {
                          setState(await call("repeat_copy", { id: repeatId }));
                          mutationVersion++;
                          scheduleSync();
                        }
                      });
                    }}
                  >
                    <Plus size={16} />
                    Create Next Copy
                  </MenuItem>
                  <MenuItem
                    disabled={
                      !all().some(
                        (copy) =>
                          refs(copy, "rt").includes(repeatId) &&
                          copy.id !== item.id,
                      )
                    }
                    onClick={() => {
                      close();
                      void run(async () => {
                        const copy = all()
                          .filter(
                            (copy) =>
                              refs(copy, "rt").includes(repeatId) &&
                              copy.id !== item.id &&
                              !trashed(copy),
                          )
                          .sort(
                            (a, b) => (b.props.sr || 0) - (a.props.sr || 0),
                          )[0];
                        if (copy && (await save())) {
                          navigate(
                            copy.props.ss
                              ? "Logbook"
                              : (copy.props.sr || 0) > today()
                                ? "Upcoming"
                                : "Today",
                          );
                          setSelected(copy.id);
                          setEditing(copy.id);
                        }
                      });
                    }}
                  >
                    <Search size={16} />
                    Show Previous Copy
                  </MenuItem>
                  <hr
                    role="separator"
                    class="mx-2 my-1 border-0 border-t border-quiet/20"
                  />
                  <MenuItem
                    disabled={!recurring()}
                    onClick={() => {
                      close();
                      void run(async () => {
                        const series = recurring();
                        if (series && (await save()))
                          await mutate(
                            event(series, { icp: !series.props.icp }),
                            true,
                          );
                      });
                    }}
                  >
                    <Show
                      when={recurring()?.props.icp}
                      fallback={<Pause size={16} />}
                    >
                      <Play size={16} />
                    </Show>
                    {recurring()?.props.icp ? "Resume" : "Pause"}
                  </MenuItem>
                  <MenuItem
                    disabled={!recurring()}
                    onClick={() => {
                      close();
                      ask(
                        "Stop future copies? Existing copies stay in your lists.",
                        async () => {
                          const series = recurring();
                          if (!series) return;
                          const changes = event(series, { tr: true });
                          for (const copy of all().filter((copy) =>
                            refs(copy, "rt").includes(series.id),
                          ))
                            Object.assign(
                              changes,
                              event(copy, {
                                rt: refs(copy, "rt").filter(
                                  (id) => id !== series.id,
                                ),
                              }),
                            );
                          await mutate(changes, true);
                          if (currentEditor === session) discardEditor();
                          else releaseEditor(session);
                        },
                      );
                    }}
                  >
                    <X size={16} />
                    Stop
                  </MenuItem>
                </Menu>
              )}
            </Popover>
          </div>
        </Show>
        <Show when={repeatOpen()}>
          <RepeatRuleDialog
            rule={repeatRule() || recurring()?.props.rr}
            next={
              repeatNext()
                ? day(repeatNext())
                : recurring()?.props.sr || (start() ? day(start()) : today())
            }
            options={
              repeatRule()
                ? repeatOptions()
                : pref("repeatOptions", {})[`${state().account}:${repeatId}`]
            }
            close={() => setRepeatOpen(false)}
            save={(rule, next, options) => {
              setRepeatRule(rule);
              setRepeatNext(next);
              setRepeatOptions(options);
              setRepeatOpen(false);
              if (!recurring()) {
                setStart(next);
                setMode("Date");
                if (options.deadlineOffset !== undefined)
                  setDeadline(date(day(next) + options.deadlineOffset * 86400));
                if (options.reminderTime)
                  setReminder(next + "T" + options.reminderTime);
              }
            }}
          />
        </Show>
        <Show when={editorFooter()}>
          {(mount) => (
            <Portal mount={mount()}>
              <div class="editor-footer contents">
                <ActionBar class="editor-footer-actions">
                  <IconButton
                    size="compact"
                    variant="quiet"
                    class="text-accent"
                    aria-label="New to-do"
                    onClick={() =>
                      void run(async () => {
                        if (await save()) beginCreate("To-Do");
                      })
                    }
                  >
                    <Plus size={18} />
                  </IconButton>
                  <IconButton
                    size="compact"
                    variant="quiet"
                    aria-label="Schedule to-do"
                    onClick={() => handleAction("when")}
                  >
                    <CalendarDays size={16} />
                  </IconButton>
                  <Popover
                    size="compact"
                    iconOnly
                    class="editor-move"
                    label="Move to"
                    trigger={<ArrowRight size={16} />}
                  >
                    {(close) => (
                      <DestinationPicker
                        all={all()}
                        item={item}
                        selected={destination()}
                        choose={(dest, inbox) => {
                          setDestination(dest?.id || "");
                          if (inbox) {
                            setMode("Inbox");
                            setStart("");
                          } else if (mode() === "Inbox") setMode("Anytime");
                          close();
                        }}
                      />
                    )}
                  </Popover>

                  <Popover
                    size="compact"
                    iconOnly
                    class="editor-more"
                    label="To-do actions"
                    trigger={<MoreHorizontal size={18} />}
                  >
                    {(close) => (
                      <TaskMenu
                        close={close}
                        project={isProject(item)}
                        inProject={!!refs(item, "pr").length}
                        action={handleAction}
                      >
                        <MenuItem
                          disabled={saving() || tagBusy() || !name().trim()}
                          onClick={() => {
                            close();
                            void save();
                          }}
                        >
                          Save edits<Kbd>⌘ ↵</Kbd>
                        </MenuItem>
                        <MenuItem
                          onClick={() => {
                            close();
                            discardEditor();
                          }}
                        >
                          Discard edits<Kbd>Esc</Kbd>
                        </MenuItem>
                        <MenuItem
                          onClick={() => {
                            setPreviewNotes((value) => !value);
                            close();
                          }}
                        >
                          {previewNotes() ? "Edit notes" : "Preview notes"}
                        </MenuItem>
                      </TaskMenu>
                    )}
                  </Popover>
                </ActionBar>
                <div class="absolute right-3.5 flex items-center gap-1">
                  <IconButton
                    size="compact"
                    variant="quiet"
                    aria-label="Move to trash"
                    onClick={() => void run(() => remove(item))}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                  <Show when={trashed(item)}>
                    <Button onClick={() => void patch(item, { tr: false })}>
                      Restore
                    </Button>
                    <Button
                      class="danger subtle bg-danger/10 text-danger bg-transparent"
                      onClick={() =>
                        ask(
                          "Permanently delete this item and everything inside it? This cannot be undone.",
                          async () => {
                            await mutate(deleteTree(item, all()), true);
                            if (currentEditor === session) discardEditor();
                            else releaseEditor(session);
                          },
                        )
                      }
                    >
                      Delete forever
                    </Button>
                  </Show>
                </div>
              </div>
            </Portal>
          )}
        </Show>
      </div>
    );
  }
}

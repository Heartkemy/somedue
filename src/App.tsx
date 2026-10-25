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
import "./editor.css";
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
  Settings,
  ChevronDown,
  ChevronRight,
  Check,
  Flag,
  Repeat2,
  MoreHorizontal,
  Cloud,
  RefreshCw,
  Tag,
  Moon,
  Folder,
  CheckCheck,
  X,
  Box,
  PanelLeft,
  ArrowRight,
  Copy,
  Share2,
  ListChecks,
  FileText,
} from "lucide-solid";
import appIcon from "../assets/icon/app.svg";
import {
  Select,
  Button,
  IconButton,
  Checkbox,
  Dialog,
  Field,
  FeedbackContext,
  Menu,
  MenuItem,
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
  projectStats,
  orderBefore,
  scheduleBucket,
  projectProgressPath,
  effectiveTags,
} from "./model";
import Markdown from "./Markdown";
import { installMotion } from "./motion";
import { createEditorSaves, type EditorSession } from "./editor-saves";
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
      repeat: string;
      repeatOpen: boolean;
      repeatId: string;
      interval: number;
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
    [selected, setSelected] = createSignal(""),
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
    [editorActions, setEditorActions] = createSignal<{
      move: () => void;
      more: () => void;
    } | null>(null),
    [sidebarWidth, setSidebarWidth] = createSignal(236),
    [confirming, setConfirming] = createSignal(false),
    [confirm, setConfirm] = createSignal<{
      text: string;
      action: () => Promise<void>;
    } | null>(null),
    [undo, setUndo] = createSignal<Changes | null>(null);
  const [editorFooter, setEditorFooter] = createSignal<HTMLDivElement>();
  function setState(input: State | ((previous: State) => State)) {
    setRawState((previous) => {
      const next = typeof input === "function" ? input(previous) : input;
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
  function openSettings() {
    if (editing()) {
      toast("Save or close the open to-do first.");
      return;
    }
    setSettings(true);
  }
  function editItem(item: Entity) {
    if (editing() && editing() !== item.id) {
      toast("Save or close the open to-do first.");
      return;
    }
    setEditing(item.id);
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
      for (const [key] of due) delete reminders[key];
      const preferences = { ...state().preferences, reminders };
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
        : all().find((e) => e.id === selected());
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
  const pref = (key: string, fallback: any) =>
    state().preferences[key] ?? fallback;
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
    await run(async () => {
      setState(await call("sync"));
      toast(
        state().account === "local" ? "Local workspace saved" : "Up to date",
      );
    });
    setBusy(false);
    if (native()) await run(async () => setState(await call("load")));
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
    if (isProject(e)) {
      navigate(e.id);
    } else setEditing(e.id);
  }
  function ask(text: string, action: () => Promise<void>) {
    setConfirm({ text, action });
    setMenu(false);
  }
  async function complete(e: Entity, cancel = false) {
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
    toast(e.props.ss ? "Reopened" : cancel ? "Canceled" : "Completed");
  }
  async function remove(e: Entity) {
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
    toast("Moved to Trash");
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
    const item = chosen();
    if (cmd && k === "z" && undo()) {
      e.preventDefault();
      void run(async () => {
        await mutate(undo()!, true, false);
        setUndo(null);
        toast("Undone");
      });
      return;
    }
    if (cmd && k === "k" && item) {
      e.preventDefault();
      void run(() => complete(item, e.altKey));
      return;
    }
    if (cmd && k === "d" && !e.shiftKey && item) {
      e.preventDefault();
      void run(() => duplicate(item));
      return;
    }
    if (cmd && ["t", "e", "r", "o"].includes(k) && item) {
      e.preventDefault();
      void patch(
        item,
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
      setDraft(null);
      setQuery("");
      setTag("");
      setMenu(false);
      return;
    }
    if ((e.key === "Backspace" || e.key === "Delete") && item) {
      e.preventDefault();
      void run(() => remove(item));
      return;
    }
    if (e.key === "Enter" && item) {
      e.preventDefault();
      openItem(item);
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
        setSelected(next.id);
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
    const saveOutside = (e: MouseEvent) => {
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
      if (item && !isProject(item)) {
        instantEditor = item.id;
        batch(() => {
          setSelected(item.id);
          setEditing(item.id);
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
            if (!isProject(item) && !isHeading(item)) instantEditor = item.id;
            openItem(item);
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
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("click", saveOutside, true);
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
        if (!editing()) void run(async () => setState(await call("load")));
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
    }, 60000);
    const reminderInterval = setInterval(() => void checkReminders(), 15000);
    onCleanup(() => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("click", saveOutside, true);
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
      width = Number(pref("sidebarWidth", sidebarWidth()));
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const update = (ev: PointerEvent) =>
      setSidebarWidth(
        Math.max(180, Math.min(380, width + ev.clientX - startX)),
      );
    const end = () => {
      handle.removeEventListener("pointermove", update);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      void persistSidebarWidth(sidebarWidth());
    };
    handle.addEventListener("pointermove", update);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }
  return (
    <FeedbackContext.Provider value={error}>
      <div
        class="app"
        style={{
          "grid-template-columns": sidebar()
            ? `${sidebarWidth()}px minmax(0, 1fr)`
            : "minmax(0, 1fr)",
        }}
        data-theme={pref("theme", "dark")}
        data-density={pref("density", "comfortable")}
        data-motion={pref("motion", true) ? "on" : "off"}
      >
        <div
          class="titlebar"
          style={{
            "padding-right": `calc(100% - ${sidebar() ? sidebarWidth() : 136}px + 8px)`,
          }}
          data-tauri-drag-region
        >
          <IconButton
            size="compact"
            variant="quiet"
            aria-label={sidebar() ? "Hide sidebar" : "Show sidebar"}
            aria-expanded={sidebar()}
            title="Toggle sidebar (⌘ /)"
            onClick={() => setSidebar((v) => !v)}
          >
            <PanelLeft size={17} />
          </IconButton>
        </div>
        <Show when={sidebar()}>
          <aside class="sidebar" inert={connectionOpen()}>
            <div
              class="sidebar-resizer"
              role="separator"
              aria-label="Sidebar width"
              aria-orientation="vertical"
              aria-valuemin={180}
              aria-valuemax={380}
              aria-valuenow={sidebarWidth()}
              tabindex="0"
              onPointerDown={resizeSidebar}
              onDblClick={() => setSidebar(false)}
              onKeyDown={(e) => {
                if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                  e.preventDefault();
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
            />
            <div class="sidebar-body">
              <nav aria-label="Lists">
                <For each={lists}>
                  {(name, i) => {
                    const Icon = navIcons[i()];
                    return (
                      <Button
                        variant="bare"
                        class="nav-item sidebar-item"
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
                        <Icon size={18} />
                        <span class="sidebar-label">{name}</span>
                        <Show
                          when={
                            ["Inbox", "Today"].includes(name) &&
                            visible(all(), name).length
                          }
                        >
                          <span class="count">
                            {visible(all(), name).length}
                          </span>
                        </Show>
                      </Button>
                    );
                  }}
                </For>
              </nav>
              <div class="containers">
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
                        class="area-row"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.stopPropagation();
                          dropIn(e, a);
                        }}
                      >
                        <Button
                          variant="bare"
                          class="area-toggle"
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
                        <Button
                          variant="bare"
                          class="sidebar-item area-link"
                          classList={{ active: list() === a.id }}
                          onClick={() => navigate(a.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => dropIn(e, a)}
                        >
                          {collapsed().includes(a.id) ? (
                            <Layers size={16} />
                          ) : (
                            <Box size={16} />
                          )}
                          <span class="sidebar-label">{title(a)}</span>
                        </Button>
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
                  <p class="sidebar-hint">
                    Make room for what matters.
                    <br />
                    <Button size="small" onClick={() => beginCreate("Area")}>
                      Create an area <Plus size={12} />
                    </Button>
                  </p>
                </Show>
              </div>
            </div>
            <div class="sidebar-bottom">
              <Button
                variant="bare"
                class="sidebar-new-list"
                aria-label="New project or area"
                onClick={() => beginCreate("Project")}
              >
                <Plus size={16} />
                <span>New List</span>
              </Button>
              <Button
                variant="bare"
                class="sync-status"
                onClick={() =>
                  state().account === "local"
                    ? (setSettingsTab("Things Cloud"), openSettings())
                    : void refresh()
                }
                title={
                  state().lastSync
                    ? `Last synced ${new Date(state().lastSync!).toLocaleString()}`
                    : "Connect Things Cloud"
                }
              >
                <span
                  class="status-dot"
                  classList={{
                    connected: state().account !== "local",
                    pending: !!state().pending,
                  }}
                />
                <span class="sidebar-status-text">
                  {busy()
                    ? "Syncing…"
                    : state().pending
                      ? `${state().pending} pending edit${state().pending === 1 ? "" : "s"}`
                      : state().account === "local"
                        ? "Saved on this Mac"
                        : "Up to date"}
                </span>
              </Button>
              <IconButton aria-label="Settings" onClick={() => openSettings()}>
                <Settings size={17} />
              </IconButton>
            </div>
          </aside>
        </Show>
        <main inert={connectionOpen()}>
          <svg
            class="workspace-curves"
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
          <div class="top-tools">
            <IconButton
              size="compact"
              variant="quiet"
              class="search-box"
              aria-label="Search all items"
              title="Quick Find (⌘ F)"
              onClick={() => openFind()}
            >
              <Search size={16} />
            </IconButton>
            <div class="toolbar-actions">
              <IconButton
                size="compact"
                variant="quiet"
                aria-label="Sync now"
                title="Sync now"
                onClick={() => void refresh()}
                disabled={busy()}
              >
                <RefreshCw size={16} classList={{ spin: busy() }} />
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
                class="popover list-menu floating-surface"
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
                <div class="menu-connection">
                  <span
                    class="menu-status-mark"
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
                  <Plus size={16} /> New To-Do <kbd>⌘ N</kbd>
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
                  <Repeat2 size={16} /> Repeating items
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
                  <Settings size={16} /> Settings… <kbd>⌘ ,</kbd>
                </MenuItem>
              </Menu>
            </Show>
          </div>
          <Show when={!native()}>
            <div class="preview-note">
              Visual preview · Open the installed app to save tasks and connect
              Things Cloud.
            </div>
          </Show>
          <Show when={error()}>
            <div role="alert" class="notice error">
              <span>{error()}</span>
              <IconButton
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </IconButton>
            </div>
          </Show>
          <section class="list-page" data-list={list()}>
            <header class="page-header">
              <div class="heading-line">
                <span class="page-symbol">
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
                  ) : (
                    <Layers />
                  )}
                </span>
                <h1>
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
                <textarea
                  class="project-notes"
                  rows="1"
                  aria-label="Project notes"
                  placeholder="Add notes to this project…"
                  value={noteText(current()!)}
                  onChange={(e) =>
                    void patch(current()!, { nt: e.currentTarget.value })
                  }
                />
              </Show>
              <div class="header-controls">
                <Show when={current()}>
                  <div class="list-tag-editor">
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
                  <div class="tag-filters">
                    <Button
                      variant="bare"
                      classList={{ selected: !tag() }}
                      onClick={() => setTag("")}
                    >
                      All
                    </Button>
                    <For each={filterTags()}>
                      {(t) => (
                        <Button
                          variant="bare"
                          classList={{ selected: tag() === t.id }}
                          onClick={() => setTag(tag() === t.id ? "" : t.id)}
                        >
                          {title(t)}
                        </Button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
              <div class="page-divider" aria-hidden="true" />
            </header>
            <Show
              when={!loading()}
              fallback={
                <div class="empty">
                  <span class="loader" />
                  Opening your workspace…
                </div>
              }
            >
              <Show
                when={items().length}
                fallback={
                  <div
                    class="empty"
                    classList={{ "symbol-only": !query() }}
                    role="status"
                    aria-label={
                      query()
                        ? "No matching to-dos"
                        : `${current() ? title(current()!) : list()} is empty`
                    }
                  >
                    <div class="empty-symbol">
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
                  <For each={items()}>
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
                          <div class="list-group-heading">
                            {group(item) === "This Evening" && (
                              <Moon size={16} />
                            )}
                            <span>{group(item)}</span>
                          </div>
                        </Show>
                        <Show
                          when={editing() === item.id}
                          fallback={
                            <div
                              id={"item-" + item.id}
                              role="listitem"
                              tabindex="0"
                              class="task-row"
                              classList={{
                                selected: selected() === item.id,
                                completed: item.props.ss === 3,
                                cancelled: item.props.ss === 2,
                                logged: !!item.props.ss,
                                later: later(item) && !item.props.ss,
                                "project-row": isProject(item),
                                heading: isHeading(item),
                              }}
                              draggable="true"
                              onFocus={(e) => {
                                if (e.target === e.currentTarget && !editing())
                                  setSelected(item.id);
                              }}
                              data-drop-edge={
                                dropTarget()?.id === item.id
                                  ? dropTarget()!.after
                                    ? "after"
                                    : "before"
                                  : undefined
                              }
                              onDragStart={(e) => {
                                setDragging(item.id);
                                setSelected(item.id);
                                if (e.dataTransfer) {
                                  e.dataTransfer.effectAllowed = "move";
                                  e.dataTransfer.setData("text/plain", item.id);
                                }
                              }}
                              onDragEnd={() => {
                                setDragging("");
                                setDropTarget(null);
                                suppressRowClickUntil = Date.now() + 250;
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                if (e.dataTransfer)
                                  e.dataTransfer.dropEffect = "move";
                                const r =
                                  e.currentTarget.getBoundingClientRect();
                                setDropTarget({
                                  id: item.id,
                                  after: e.clientY > r.y + r.height / 2,
                                });
                              }}
                              onDragLeave={(e) => {
                                if (
                                  !e.currentTarget.contains(
                                    e.relatedTarget as Node,
                                  )
                                )
                                  setDropTarget(null);
                              }}
                              onDrop={(e) => rowDrop(e, item)}
                              onClick={(e) => {
                                if (Date.now() < suppressRowClickUntil) return;
                                if (
                                  !(e.target as HTMLElement).closest(
                                    "button,input,[data-row-control]",
                                  )
                                )
                                  openItem(item);
                              }}
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" &&
                                  e.target === e.currentTarget
                                ) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openItem(item);
                                }
                              }}
                            >
                              <Show when={!isHeading(item)}>
                                <Button
                                  variant="bare"
                                  class="task-check"
                                  classList={{ project: isProject(item) }}
                                  aria-label={`${item.props.ss ? "Reopen" : "Complete"} ${title(item)}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void run(() => complete(item, e.altKey));
                                  }}
                                >
                                  {item.props.ss ? (
                                    item.props.ss === 2 ? (
                                      <X size={13} />
                                    ) : (
                                      <Check size={13} />
                                    )
                                  ) : isProject(item) ? (
                                    <ProjectProgress project={item} />
                                  ) : null}
                                </Button>
                              </Show>
                              <Show when={item.props.ss}>
                                <span
                                  class="logged-date"
                                  title={
                                    item.props.ss === 2
                                      ? "Cancelled"
                                      : "Completed"
                                  }
                                >
                                  {item.props.sp
                                    ? new Date(
                                        item.props.sp * 1000,
                                      ).toLocaleDateString("en", {
                                        month: "short",
                                        day: "numeric",
                                      })
                                    : "Date unavailable"}
                                </span>
                              </Show>
                              <div class="task-content">
                                <div class="task-summary">
                                  <span class="task-title">
                                    {editorSaves.drafts
                                      .get(item.id)
                                      ?.read()
                                      .name.trim() || title(item)}
                                  </span>
                                  <Show when={isProject(item)}>
                                    <span class="project-task-count">
                                      {item.props.ss
                                        ? projectStats(item, all()).total
                                        : projectStats(item, all()).remaining}
                                    </span>
                                  </Show>
                                  <div class="task-meta">
                                    <For each={refs(item, "tg")}>
                                      {(id) => (
                                        <span class="row-tag">
                                          {title(
                                            tags().find((t) => t.id === id) || {
                                              id,
                                              kind: "Tag4",
                                              props: { tt: "Tag" },
                                            },
                                          )}
                                        </span>
                                      )}
                                    </For>
                                    <Show when={refs(item, "rt").length}>
                                      <Repeat2 size={13} />
                                    </Show>
                                    <Show when={noteText(item)}>
                                      <span
                                        class="note-lines"
                                        title="Has notes"
                                      >
                                        <FileText size={13} />
                                      </span>
                                    </Show>
                                    <Show
                                      when={all().some((e) =>
                                        refs(e, "ts").includes(item.id),
                                      )}
                                    >
                                      <span class="checklist-count">
                                        {
                                          all().filter(
                                            (e) =>
                                              refs(e, "ts").includes(item.id) &&
                                              e.props.ss === 3,
                                          ).length
                                        }
                                        /
                                        {
                                          all().filter((e) =>
                                            refs(e, "ts").includes(item.id),
                                          ).length
                                        }
                                      </span>
                                    </Show>
                                    <Show when={item.props.dd}>
                                      <span
                                        class="deadline"
                                        classList={{
                                          overdue: item.props.dd < today(),
                                        }}
                                      >
                                        <Flag size={11} />
                                        {new Date(
                                          item.props.dd * 1000,
                                        ).toLocaleDateString("en", {
                                          month: "short",
                                          day: "numeric",
                                          timeZone: "UTC",
                                        })}
                                      </span>
                                    </Show>
                                    <Show
                                      when={!item.props.ss && !isHeading(item)}
                                    >
                                      <div
                                        data-row-control
                                        class="row-schedule"
                                        onClick={(e) => e.stopPropagation()}
                                        role="group"
                                        aria-label={`Schedule ${title(item)}`}
                                      >
                                        <DatePicker
                                          kind="when"
                                          reminder={
                                            pref("reminders", {})[
                                              `${state().account}:${item.id}`
                                            ] || ""
                                          }
                                          changeReminder={(value) =>
                                            void saveReminder(item, value)
                                          }
                                          value={date(
                                            item.props.sr || item.props.tir,
                                          )}
                                          mode={
                                            item.props.st === 2 &&
                                            !(item.props.sr || item.props.tir)
                                              ? "Someday"
                                              : item.props.sr || item.props.tir
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
                                      </div>
                                    </Show>
                                    <Show when={selected() === item.id}>
                                      <IconButton
                                        aria-label={`Edit ${title(item)}`}
                                        onClick={() => editItem(item)}
                                      >
                                        <MoreHorizontal size={17} />
                                      </IconButton>
                                    </Show>
                                  </div>
                                </div>
                                <Show
                                  when={!current() && container(item, all())}
                                >
                                  <span class="container-label">
                                    {container(item, all())}
                                  </span>
                                </Show>
                              </div>
                            </div>
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
                </div>
              </Show>
            </Show>
            <Show when={current() && !items().some((item) => !!item.props.ss)}>
              <ListVisibility />
            </Show>
          </section>
          <footer class="list-footer">
            <div ref={setEditorFooter} class="editor-footer-slot" />
            <Show when={!editing() || !editorActions()}>
              <div class="footer-actions">
                <IconButton
                  size="compact"
                  variant="quiet"
                  class="footer-add"
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
                        void patch(chosen()!, schedule(mode || "Date", value))
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
              </div>
              <Show when={chosen()}>
                <div class="footer-selection-actions">
                  <IconButton
                    size="compact"
                    variant="quiet"
                    aria-label="Trash selected item"
                    onClick={() => void run(() => remove(chosen()!))}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                  <IconButton
                    size="compact"
                    variant="quiet"
                    aria-label="Selected item actions"
                    onClick={() =>
                      editing() ? editorActions()?.more() : editItem(chosen()!)
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
                  class="footer-undo"
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
          <Show when={notice()}>
            <div
              role="status"
              class="toast floating-surface"
              onMouseEnter={pauseNotice}
              onMouseLeave={resumeNotice}
              onFocusIn={pauseNotice}
              onFocusOut={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  resumeNotice();
              }}
            >
              <span class="toast-mark">
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
        <Show when={findOpen()}>
          <QuickFind />
        </Show>
        <Show when={creating()}>
          <CreateDialog />
        </Show>
        <Show when={moving() && chosen()}>
          <Dialog title="Move to…" close={() => setMoving(false)}>
            <div class="destination-list">
              <Button
                onClick={() =>
                  void run(async () => {
                    await mutate(event(chosen()!, move(chosen()!, null)));
                    setMoving(false);
                  })
                }
              >
                <Inbox size={17} />
                Inbox
              </Button>
              <For
                each={[
                  ...areas(),
                  ...projects(),
                  ...all().filter((e) => isHeading(e) && active(e, all())),
                ].filter((x) => x.id !== chosen()?.id)}
              >
                {(dest) => (
                  <Button
                    onClick={() =>
                      void run(async () => {
                        await mutate(event(chosen()!, move(chosen()!, dest)));
                        setMoving(false);
                      })
                    }
                  >
                    <Folder size={17} />
                    {title(dest)}
                    <small>{container(dest, all())}</small>
                  </Button>
                )}
              </For>
            </div>
          </Dialog>
        </Show>
        <Show when={connectionOpen()}>
          <CloudConnection
            connected={(next) => {
              setState(next);
              setConnectionOpen(false);
              setError("");
              toast("Things Cloud connected");
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
        <Show when={settings()}>
          <SettingsDialog />
        </Show>
        <Show when={confirm()}>
          <Dialog
            title="Please confirm"
            close={() => {
              if (!confirming()) setConfirm(null);
            }}
          >
            <p class="confirm-text">{confirm()!.text}</p>
            <div class="dialog-actions">
              <Button disabled={confirming()} onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                class="danger"
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
    const item = all().find(
      (x) => x.id === e.dataTransfer?.getData("text/plain"),
    );
    if (!item || item.id === target.id || editing()) return;
    if (item.kind.startsWith("Area") && target.kind.startsWith("Area"))
      void run(() => mutate(orderBefore(areas(), item, target)));
    else if (isProject(item) && isProject(target)) {
      const scope = projects().filter(
        (p) => refs(p, "ar")[0] === refs(target, "ar")[0] || p.id === item.id,
      );
      const changes = orderBefore(scope, item, target);
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
      <Button
        variant="bare"
        class="project-nav sidebar-item"
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
        <span class="sidebar-label">{title(props.p)}</span>
      </Button>
    );
  }
  function ProjectProgress(props: { project: Entity }) {
    const ratio = () => {
      const stats = projectStats(props.project, all());
      return stats.total ? stats.done / stats.total : 0;
    };
    return (
      <svg
        class="project-ring"
        viewBox="0 0 20 20"
        role="img"
        aria-label={`${Math.round(ratio() * 100)}% complete`}
      >
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <path
          class="project-sector"
          fill="currentColor"
          d={projectProgressPath(ratio())}
        />
      </svg>
    );
  }
  function ListVisibility() {
    const count = () =>
      visible(all(), list(), "", "", true).filter((item) => !!item.props.ss)
        .length;
    return (
      <div class="list-visibility">
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
  function HeadingEditor(props: { item: Entity }) {
    const item = props.item;
    const [name, setName] = createSignal(
      editorSaves.drafts.get(item.id)?.read().name ?? title(item),
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
      <div class="heading inline-heading-editor">
        <input
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
              discardEditor();
            }
          }}
        />
        <IconButton
          size="compact"
          variant="quiet"
          aria-label="Save heading"
          onClick={() => void save()}
        >
          <Check size={16} />
        </IconButton>
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
                  discardEditor();
                }}
              >
                <X size={16} /> Cancel edit
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  void run(() => remove(props.item));
                }}
              >
                <Trash2 size={16} /> Move heading to Trash
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
        ...lists.map((name) => ({ id: name, label: name })),
        ...areas().map((a) => ({ id: a.id, label: title(a) })),
        ...projects().map((p) => ({ id: p.id, label: title(p) })),
      ].filter((x) =>
        x.label.toLowerCase().includes(findQuery().toLowerCase()),
      );
    const results = () =>
      findQuery().trim()
        ? visible(all(), "Inbox", findQuery())
            .filter((e) => !isProject(e) && !isHeading(e))
            .slice(0, 40)
        : [];
    const entries = () => [
      ...destinations().map((d) => ({
        id: d.id,
        label: d.label,
        item: null as Entity | null,
      })),
      ...results().map((item) => ({ id: item.id, label: title(item), item })),
    ];
    function choose(index: number) {
      const entry = entries()[index];
      if (!entry) return;
      setFindOpen(false);
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
      <Dialog title="Quick Find" close={() => setFindOpen(false)}>
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
          <div class="find-input">
            <Search size={18} />
            <input
              ref={input}
              aria-label="Quick Find query"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls="find-results"
              aria-activedescendant={
                entries().length ? `find-result-${findIndex()}` : undefined
              }
              placeholder="Find a list, to-do or #tag…"
              value={findQuery()}
              onInput={(e) => {
                setFindQuery(e.currentTarget.value);
                setFindIndex(0);
              }}
            />
          </div>
          <div
            id="find-results"
            class="find-results"
            role="listbox"
            aria-label="Quick Find results"
          >
            <For each={entries()}>
              {(entry, i) => (
                <Button
                  variant="bare"
                  role="option"
                  id={`find-result-${i()}`}
                  aria-selected={findIndex() === i()}
                  classList={{ "find-active": findIndex() === i() }}
                  onPointerMove={() => setFindIndex(i())}
                  onClick={() => choose(i())}
                >
                  {entry.item ? <FileText size={16} /> : <Folder size={16} />}
                  <span>{entry.label}</span>
                  <Show when={entry.item}>
                    <small>{container(entry.item!, all())}</small>
                  </Show>
                </Button>
              )}
            </For>
          </div>
          <Show when={!entries().length}>
            <p class="muted">No matching lists or to-dos.</p>
          </Show>
          <p class="find-hint">
            ↑ ↓ to choose · Return to open · Escape to close
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
        toast("Created");
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
            <input
              autofocus
              required
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="What’s on your mind?"
            />
          </Field>
          <Show when={kind() !== "Rename"}>
            <div class="field-grid">
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
          <div class="dialog-actions">
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
            : item.props.sr
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
      [repeat, setRepeat] = createSignal(restored?.repeat ?? ""),
      [repeatOpen, setRepeatOpen] = createSignal(restored?.repeatOpen ?? false),
      [interval, setInterval] = createSignal(restored?.interval ?? 1),
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
    const repeatId = restored?.repeatId || uuid();
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
      repeat: repeat(),
      repeatOpen: repeatOpen(),
      repeatId,
      interval: interval(),
      checks: checks().map((check) => ({ ...check })),
      status: status(),
      destination: destination(),
      convert: conversion,
    });
    const session = editorSaves.retain(item, read);
    currentEditor = session;
    let editor!: HTMLDivElement;
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
      return all().find((e) => e.id === refs(saved, "rt")[0]);
    };
    let inFlight: Promise<boolean | undefined> | undefined;
    function save(
      convert = false,
      handoff = false,
    ): Promise<boolean | undefined> | false {
      if (tagBusy()) return false;
      if (saving() && !handoff) return inFlight || false;
      if (!name().trim()) {
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
        snapshot.repeat &&
        recurring() &&
        recurring()!.id !== snapshot.repeatId
      ) {
        setError("Stop the existing repetition before choosing a new rule.");
        return false;
      }
      setSaving(true);
      const result = persistEditor(session, async () => {
        const savedItem = all().find((saved) => saved.id === item.id) || item;
        const existingChecks = all().filter((e) =>
          refs(e, "ts").includes(item.id),
        );
        const p: Props = {
          tt: snapshot.name.trim(),
          ...(snapshot.convert ? { tp: 1 } : {}),
          nt: snapshot.notes,
          ...move(
            savedItem,
            all().find((e) => e.id === snapshot.destination) || null,
          ),
          ...schedule(
            snapshot.mode === "Inbox" && snapshot.destination
              ? "Anytime"
              : snapshot.mode,
            snapshot.start,
          ),
          ss: snapshot.status,
          sp: snapshot.status ? savedItem.props.sp || Date.now() / 1000 : null,
          dd: snapshot.deadline ? day(snapshot.deadline) : null,
          tg: snapshot.tags,
        };
        const changes: Changes = !all().some((saved) => saved.id === item.id)
          ? { [item.id]: { e: item.kind, t: 0, p: { ...item.props, ...p } } }
          : event(savedItem, p);
        for (const c of snapshot.checks) {
          const old = existingChecks.find((e) => e.id === c.id);
          if (c.title.trim())
            changes[c.id] = {
              e: c.kind,
              t: old ? 1 : 0,
              p: {
                tt: c.title.trim(),
                ss: c.done ? 3 : 0,
                sp: c.done ? Date.now() / 1000 : null,
                ix: snapshot.checks.indexOf(c) * 1024,
                ts: [item.id],
              },
            };
          else if (old) changes[c.id] = { e: old.kind, t: 2, p: {} };
        }
        for (const old of existingChecks)
          if (!snapshot.checks.some((c) => c.id === old.id))
            changes[old.id] = { e: old.kind, t: 2, p: {} };
        if (snapshot.repeat) {
          const existing = all().find((e) => e.id === refs(savedItem, "rt")[0]);
          if (
            existing &&
            (existing.id !== snapshot.repeatId ||
              existing.props.rr?.fu !== Number(snapshot.repeat) ||
              existing.props.rr?.fa !== snapshot.interval)
          )
            throw Error(
              "Stop the existing repetition before choosing a new rule.",
            );
          if (!existing) {
            const fu = Number(snapshot.repeat),
              first = p.sr || today();
            const templateId = snapshot.repeatId;
            const d = new Date(first * 1000);
            const details =
              fu === 256
                ? [{ wd: d.getUTCDay() }]
                : fu === 8
                  ? [{ dy: d.getUTCDate() - 1 }]
                  : fu === 4
                    ? [{ dy: d.getUTCDate() - 1, mo: d.getUTCMonth() }]
                    : [{}];
            const rr = {
              fu,
              fa: snapshot.interval,
              of: details,
              ia: first,
              ed: 64092211200,
              rc: 0,
              rrv: 4,
              tp: 0,
              ts: 0,
            };
            const template = {
              ...savedItem.props,
              ...p,
              ss: 0,
              sp: null,
              rr,
              rt: [],
              icsd: first,
              icp: false,
            };
            changes[templateId] = { e: "Task6", t: 0, p: template };
            changes[item.id].p = {
              ...changes[item.id].p,
              rt: [templateId],
              sr: first,
              tir: first,
              st: first > today() ? 2 : 1,
            };
          }
        }
        await mutate(changes, true);
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
        toast("Saved");
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
    return (
      <div
        class="task-editor"
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
        <div class="editor-title">
          <Button
            variant="bare"
            class="task-check"
            aria-label={status() ? "Reopen to-do" : "Complete to-do"}
            aria-pressed={!!status()}
            onClick={(e) => setStatus(status() ? 0 : e.altKey ? 2 : 3)}
          >
            <Show when={status()}>
              <Check size={13} />
            </Show>
          </Button>
          <input
            autofocus
            aria-label="To-do title"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="New to-do"
          />
        </div>
        <div class="editor-notes-block">
          <Show
            when={previewNotes()}
            fallback={
              <textarea
                class="editor-notes"
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
        <div class="checklist" hidden={!checks().length}>
          <For each={checks()}>
            {(c) => (
              <div class="check-row" data-check-id={c.id}>
                <Checkbox
                  aria-label={`Complete checklist ${c.title}`}
                  type="checkbox"
                  checked={c.done}
                  onChange={(e) =>
                    setChecks((v) =>
                      v.map((x) =>
                        x.id === c.id
                          ? { ...x, done: e.currentTarget.checked }
                          : x,
                      ),
                    )
                  }
                />
                <input
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
                      setChecks((rows) => {
                        const i = rows.findIndex((x) => x.id === c.id),
                          j = i + (e.key === "ArrowUp" ? -1 : 1);
                        if (j < 0 || j >= rows.length) return rows;
                        const next = [...rows];
                        [next[i], next[j]] = [next[j], next[i]];
                        return next;
                      });
                      focusCheck(c.id);
                    }
                  }}
                />
                <IconButton
                  size="compact"
                  variant="quiet"
                  aria-label="Remove checklist item"
                  onClick={() =>
                    setChecks((v) => v.filter((x) => x.id !== c.id))
                  }
                >
                  <X size={13} />
                </IconButton>
              </div>
            )}
          </For>
          <Button
            size="small"
            variant="quiet"
            class="add-check"
            onClick={() => addCheck()}
          >
            <Plus size={13} />
            Checklist item
          </Button>
        </div>
        <div class="editor-tools">
          <DatePicker
            compact
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
            kind="deadline"
            value={deadline()}
            change={setDeadline}
          />
        </div>
        <Show when={!item.props.rp && (repeatOpen() || recurring())}>
          <div class="repeat-panel">
            <span class="muted">Repeat</span>
            <Field label="Frequency">
              <Select
                value={repeat()}
                onChange={(e) => setRepeat(e.currentTarget.value)}
              >
                <option value="">Never</option>
                <option value="16">Daily</option>
                <option value="256">Weekly</option>
                <option value="8">Monthly</option>
                <option value="4">Yearly</option>
              </Select>
            </Field>
            <Show when={repeat()}>
              <Field label="Every">
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={interval()}
                  onInput={(e) =>
                    setInterval(
                      Math.max(
                        1,
                        Math.min(99, Number(e.currentTarget.value) || 1),
                      ),
                    )
                  }
                />
              </Field>
              <p class="muted">
                Future copies require Things on a connected device.
              </p>
            </Show>
            <Show when={recurring()}>
              <p class="muted">
                This copy belongs to an existing repeating schedule.
              </p>
              <Button
                onClick={() =>
                  ask(
                    "Stop future copies? Existing copies stay in your lists.",
                    async () => {
                      await mutate(
                        {
                          ...event(recurring()!, { tr: true }),
                          ...event(item, { rt: [], rr: null, icsd: null }),
                        },
                        true,
                      );
                      if (currentEditor === session) discardEditor();
                      else releaseEditor(session);
                    },
                  )
                }
              >
                Stop repeating
              </Button>
            </Show>
          </div>
        </Show>
        <Show when={editorFooter()}>
          {(mount) => (
            <Portal mount={mount()}>
              <div class="editor-footer">
                <Popover
                  size="compact"
                  iconOnly
                  class="editor-move"
                  label="Move to"
                  trigger={<ArrowRight size={16} />}
                >
                  {(close) => (
                    <>
                      <div class="destination-list">
                        <Button
                          onClick={() => {
                            setDestination("");
                            setMode("Inbox");
                            close();
                          }}
                        >
                          <Inbox size={16} />
                          Inbox
                        </Button>
                        <Button
                          onClick={() => {
                            setDestination("");
                            if (mode() === "Inbox") setMode("Anytime");
                            close();
                          }}
                        >
                          <X size={16} />
                          No Project
                        </Button>
                        <For
                          each={all().filter(
                            (e) =>
                              (e.kind.startsWith("Area") ||
                                isProject(e) ||
                                isHeading(e)) &&
                              active(e, all()) &&
                              e.id !== item.id &&
                              (!isProject(item) || e.kind.startsWith("Area")),
                          )}
                        >
                          {(e) => (
                            <Button
                              onClick={() => {
                                setDestination(e.id);
                                if (mode() === "Inbox") setMode("Anytime");
                                close();
                              }}
                            >
                              <Folder size={16} />
                              {title(e)}
                            </Button>
                          )}
                        </For>
                      </div>
                    </>
                  )}
                </Popover>
                <IconButton
                  size="compact"
                  variant="quiet"
                  aria-label="Move to trash"
                  onClick={() => void run(() => remove(item))}
                >
                  <Trash2 size={15} />
                </IconButton>
                <Popover
                  size="compact"
                  iconOnly
                  class="editor-more"
                  label="To-do actions"
                  trigger={<MoreHorizontal size={18} />}
                >
                  {(close) => (
                    <Menu close={close}>
                      <MenuItem
                        disabled={saving() || tagBusy() || !name().trim()}
                        onClick={() => {
                          close();
                          void save();
                        }}
                      >
                        Save edits <kbd>⌘ ↵</kbd>
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          close();
                          discardEditor();
                        }}
                      >
                        Discard edits <kbd>Esc</kbd>
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          setPreviewNotes((v) => !v);
                          close();
                        }}
                      >
                        {previewNotes() ? "Edit notes" : "Preview notes"}
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          setRepeatOpen(true);
                          close();
                        }}
                      >
                        <Repeat2 size={16} />
                        Repeat…
                      </MenuItem>
                      <MenuItem
                        disabled={saving() || !name().trim()}
                        onClick={() => {
                          close();
                          void run(async () => {
                            if (await save()) {
                              const saved = all().find((e) => e.id === item.id);
                              if (saved) await duplicate(saved);
                            }
                          });
                        }}
                      >
                        <Copy size={16} />
                        Duplicate
                      </MenuItem>
                      <Show when={!isProject(item)}>
                        <MenuItem
                          disabled={saving() || !name().trim()}
                          onClick={() => {
                            close();
                            void save(true);
                          }}
                        >
                          <Folder size={16} />
                          Convert to Project…
                        </MenuItem>
                      </Show>
                      <MenuItem
                        onClick={() => {
                          close();
                          void run(async () => {
                            const text = [name(), notes()]
                              .filter(Boolean)
                              .join("\n\n");
                            if (navigator.share)
                              await navigator.share({ title: name(), text });
                            else {
                              await navigator.clipboard.writeText(text);
                              toast("Copied to clipboard");
                            }
                          });
                        }}
                      >
                        <Share2 size={16} />
                        Share…
                      </MenuItem>
                      <Show when={!draft()}>
                        <MenuItem
                          onClick={() => {
                            setStatus(status() === 2 ? 0 : 2);
                            close();
                          }}
                        >
                          <X size={16} />
                          {status() === 2 ? "Reopen" : "Cancel"} to-do
                        </MenuItem>
                      </Show>
                    </Menu>
                  )}
                </Popover>
                <Show when={trashed(item)}>
                  <Button onClick={() => void patch(item, { tr: false })}>
                    Restore
                  </Button>
                  <Button
                    class="danger subtle"
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
            </Portal>
          )}
        </Show>
      </div>
    );
  }
  function SettingsDialog() {
    const [newTag, setNewTag] = createSignal(""),
      [shortcut, setShortcut] = createSignal(pref("quickShortcut", ""));
    async function preference(key: string, value: any) {
      await run(async () => {
        const preferences = { ...state().preferences, [key]: value };
        await call("preferences", { value: preferences });
        setState((s) => ({ ...s, preferences }));
      });
    }
    async function exportData() {
      await run(async () => {
        const data = await call<string>("export_data");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(
          new Blob([data], { type: "application/json" }),
        );
        a.download = `somedue-${date(today())}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast("Backup exported");
      });
    }
    return (
      <Dialog
        title="Settings"
        close={() => {
          setSettings(false);
        }}
        wide
      >
        <div class="settings-layout">
          <nav aria-label="Settings categories">
            <For
              each={[
                "General",
                "Appearance",
                "Things Cloud",
                "Tags",
                "Keyboard",
                "About",
              ]}
            >
              {(tab) => (
                <Button
                  variant="bare"
                  classList={{ active: settingsTab() === tab }}
                  onClick={() => setSettingsTab(tab)}
                >
                  {tab}
                </Button>
              )}
            </For>
          </nav>
          <div class="settings-content">
            <Show when={settingsTab() === "General"}>
              <h3>Make space for your day.</h3>
              <p class="muted">A few preferences to make Somedue your own.</p>
              <Field label="New to-dos go to">
                <Select
                  value={pref("defaultList", "Inbox")}
                  onChange={(e) =>
                    void preference("defaultList", e.currentTarget.value)
                  }
                >
                  <option>Inbox</option>
                  <option>Today</option>
                </Select>
              </Field>
              <label class="check-label">
                <Checkbox
                  type="checkbox"
                  checked={pref("autoSync", true)}
                  onChange={(e) =>
                    void preference("autoSync", e.currentTarget.checked)
                  }
                />
                Sync automatically while the app is open
              </label>
              <div class="settings-group">
                <h4>Quick Entry</h4>
                <p>
                  Capture a thought from any app. Choose an unused shortcut,
                  such as Control+Shift+Space.
                </p>
                <Field
                  label="Global shortcut"
                  hint="Leave empty to turn it off."
                >
                  <input
                    aria-label="Global shortcut"
                    placeholder="Control+Shift+Space"
                    value={shortcut()}
                    onInput={(e) => setShortcut(e.currentTarget.value)}
                  />
                </Field>
                <Show when={state().shortcutError}>
                  <p role="alert" class="error-text">
                    {state().shortcutError}
                  </p>
                </Show>
                <div class="quick-setting-actions">
                  <Button
                    onClick={() =>
                      void run(async () => {
                        await call("configure_shortcut", {
                          shortcut: shortcut().trim(),
                        });
                        setState(await call("load"));
                        toast("Quick Entry shortcut saved");
                      })
                    }
                  >
                    Save shortcut
                  </Button>
                  <Button onClick={() => void run(() => call("quick_entry"))}>
                    Open Quick Entry
                  </Button>
                </div>
              </div>
              <div class="settings-group">
                <h4>Your data</h4>
                <p>
                  Local and cloud workspaces stay separate. Offline edits are
                  saved on this Mac before syncing.
                </p>
                <Button onClick={() => void exportData()}>
                  <Archive size={16} />
                  Export backup
                </Button>
              </div>
            </Show>
            <Show when={settingsTab() === "Appearance"}>
              <h3>A quieter workspace.</h3>
              <Field label="Color theme">
                <Select
                  value={pref("theme", "dark")}
                  onChange={(e) =>
                    void preference("theme", e.currentTarget.value)
                  }
                >
                  <option value="dark">Dark</option>
                  <option value="light">Warm light</option>
                </Select>
              </Field>
              <Field label="List density">
                <Select
                  value={pref("density", "comfortable")}
                  onChange={(e) =>
                    void preference("density", e.currentTarget.value)
                  }
                >
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </Select>
              </Field>
              <label class="check-label">
                <Checkbox
                  type="checkbox"
                  checked={pref("motion", true)}
                  onChange={(e) =>
                    void preference("motion", e.currentTarget.checked)
                  }
                />
                Animate transitions
              </label>
              <p class="muted">System Reduce Motion always takes precedence.</p>
            </Show>
            <Show when={settingsTab() === "Things Cloud"}>
              <h3>Everything, together.</h3>
              <p class="muted">
                Connect using your Things Cloud account. Your password is stored
                only in macOS Keychain.
              </p>
              <Show
                when={state().account === "local"}
                fallback={
                  <div class="account-card">
                    <Cloud size={24} />
                    <strong>{state().account}</strong>
                    <span>
                      {state().lastSync
                        ? `Last sync ${new Date(state().lastSync!).toLocaleString()}`
                        : "Not yet synced"}
                    </span>
                    <span>{state().pending} pending edits</span>
                    <Button onClick={() => void refresh()} disabled={busy()}>
                      <RefreshCw size={15} />
                      Sync now
                    </Button>
                    <Button
                      onClick={() =>
                        ask(
                          "Disconnect this account? Its cached tasks and pending edits stay on this Mac. The password will be removed from Keychain.",
                          async () => {
                            setState(await call("disconnect"));
                            toast("Disconnected");
                          },
                        )
                      }
                    >
                      Disconnect
                    </Button>
                  </div>
                }
              >
                <Button
                  variant="primary"
                  onClick={() => {
                    setSettings(false);
                    setConnectionOpen(true);
                  }}
                >
                  Connect Things Cloud
                </Button>
                <p class="small muted connect-hint">
                  Signing in opens your cloud workspace. Your local to-dos
                  remain saved separately.
                </p>
              </Show>
              <Show when={state().blocked}>
                <div class="settings-group">
                  <h4>Sync recovery</h4>
                  <p>
                    A change may conflict with another device or have an
                    unconfirmed server response. Pending edits are preserved and
                    will not be resent automatically.
                  </p>
                  <Button onClick={() => void exportData()}>
                    Export drafts first
                  </Button>
                  <Button
                    onClick={() =>
                      ask(
                        "Replace pending drafts with the current cloud version? A recovery copy will be retained in your local backup.",
                        async () => {
                          setState(
                            await call("resolve_drafts", { confirm: true }),
                          );
                          toast("Cloud version restored");
                        },
                      )
                    }
                  >
                    Use cloud version
                  </Button>
                </div>
              </Show>
            </Show>
            <Show when={settingsTab() === "Tags"}>
              <h3>A place for every context.</h3>
              <form
                class="tag-create"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    if (!newTag().trim()) return;
                    await mutate(
                      create("Tag4", { tt: newTag().trim(), sh: "", pn: [] }),
                    );
                    setNewTag("");
                  });
                }}
              >
                <input
                  aria-label="New tag name"
                  placeholder="New tag"
                  value={newTag()}
                  onInput={(e) => setNewTag(e.currentTarget.value)}
                />
                <IconButton type="submit" aria-label="Create tag">
                  <Plus size={18} />
                </IconButton>
              </form>
              <For each={tags()}>
                {(t) => (
                  <div class="tag-setting">
                    <Tag size={14} />
                    <input
                      aria-label={`Rename tag ${title(t)}`}
                      value={title(t)}
                      onChange={(e) =>
                        void patch(t, { tt: e.currentTarget.value })
                      }
                    />
                    <IconButton
                      aria-label={`Delete tag ${title(t)}`}
                      onClick={() =>
                        ask(
                          `Delete the tag “${title(t)}” from all items?`,
                          async () => {
                            const changes: Changes = {
                              [t.id]: { e: t.kind, t: 2, p: {} },
                            };
                            for (const e of all().filter((x) =>
                              refs(x, "tg").includes(t.id),
                            ))
                              Object.assign(
                                changes,
                                event(e, {
                                  tg: refs(e, "tg").filter((id) => id !== t.id),
                                }),
                              );
                            await mutate(changes, true);
                          },
                        )
                      }
                    >
                      <X size={14} />
                    </IconButton>
                  </div>
                )}
              </For>
            </Show>
            <Show when={settingsTab() === "Keyboard"}>
              <h3>Keep your hands on the keys.</h3>
              <div class="shortcuts">
                <For
                  each={[
                    ["New to-do", "⌘ N"],
                    ["New project", "⌥ ⌘ N"],
                    ["New heading", "⇧ ⌘ N"],
                    ["Navigate lists", "⌘ 1 … 7"],
                    ["Search", "⌘ F"],
                    ["Open selection", "↵"],
                    ["Save & close", "⌘ ↵"],
                    ["Complete / reopen", "⌘ K"],
                    ["Cancel item", "⌥ ⌘ K"],
                    ["Move to…", "⇧ ⌘ M"],
                    ["Reorder", "⌘ ↑ / ↓"],
                    ["Today / This Evening", "⌘ T / ⌘ E"],
                    ["Anytime / Someday", "⌘ R / ⌘ O"],
                    ["Duplicate", "⌘ D"],
                    ["Undo last edit", "⌘ Z"],
                    ["Trash selected item", "⌫"],
                    ["Settings", "⌘ ,"],
                  ]}
                >
                  {(row) => (
                    <div>
                      <span>{row[0]}</span>
                      <kbd>{row[1]}</kbd>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <Show when={settingsTab() === "About"}>
              <img class="about-mark" src={appIcon} alt="Somedue app icon" />
              <h3>Somedue</h3>
              <p>A considered home for what comes next.</p>
              <p class="muted">
                Version 0.1.0
                <br />
                An independent Things Cloud client.
                <br />
                Not affiliated with Cultured Code.
              </p>
              <p class="small muted">
                Local certificate signing. Not notarized.
                <br />
                Cloud protocol is unofficial. See the repository’s verification
                record for tested behavior and limitations.
              </p>
            </Show>
          </div>
        </div>
      </Dialog>
    );
  }
}

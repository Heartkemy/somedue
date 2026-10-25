import { createSignal, For, Show, onMount } from "solid-js";
import {
  ArrowLeft,
  Archive,
  Cloud,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
} from "lucide-solid";
import {
  Button,
  Checkbox,
  Field,
  IconButton,
  Input,
  Kbd,
  Pill,
  SectionHeading,
  Select,
} from "./ui";
import { call } from "./api";
import {
  create,
  date,
  event,
  title,
  today,
  refs,
  type State,
  type Entity,
  type Props,
  type Changes,
} from "./model";
import appIcon from "../assets/icon/app.svg";
export default function SettingsPage(props: {
  state: State;
  tab: string;
  setTab: (tab: string) => void;
  backLabel: string;
  close: () => void;
  connect: () => void;
  syncing: boolean;
  sync: () => Promise<void>;
  changeState: (state: State | ((previous: State) => State)) => void;
  mutate: (changes: Changes, confirmed?: boolean) => Promise<void>;
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  ask: (text: string, action: () => Promise<void>) => void;
}) {
  const state = () => props.state,
    settingsTab = () => props.tab;
  const pref = (key: string, fallback: any) =>
    state().preferences[key] ?? fallback;
  const all = () => state().entities;
  const tags = () =>
    all()
      .filter((item) => item.kind.startsWith("Tag"))
      .sort((a, b) => title(a).localeCompare(title(b)));
  const setState = props.changeState,
    mutate = props.mutate,
    run = props.run,
    ask = props.ask,
    setSettingsTab = props.setTab;
  const patch = (item: Entity, fields: Props) =>
    run(() => mutate(event(item, fields)));
  let heading!: HTMLHeadingElement;
  let panel!: HTMLElement;
  onMount(() => heading.focus({ preventScroll: true }));

  const [newTag, setNewTag] = createSignal(""),
    [shortcut, setShortcut] = createSignal(pref("quickShortcut", ""));
  const sections: Record<string, string> = {
    General: "Capture, sync & Quick Entry",
    Appearance: "Theme, spacing & motion",
    "Things Cloud": "Account, sync & recovery",
    Tags: "Organize your to-dos",
    Keyboard: "Shortcuts & navigation",
    About: "Somedue on this computer",
  };
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
    });
  }
  return (
    <section
      ref={panel}
      class="settings-panel min-h-0 flex-1 overflow-auto overscroll-contain px-11 pt-7 pb-12 max-lg:px-7"
      aria-labelledby="settings-title"
    >
      <nav
        aria-label="Breadcrumb"
        class="settings-breadcrumb mb-7 flex items-center gap-3 text-xs text-quiet"
      >
        <span class="size-1.5 rounded-full bg-accent" />
        <span class="tracking-widest">Somedue</span>
        <span aria-hidden="true">/</span>
        <span>Settings</span>
      </nav>
      <header class="settings-page-header mb-8 grid grid-cols-[--spacing(48)_minmax(0,1fr)] items-center gap-8 max-lg:grid-cols-1 max-lg:gap-4">
        <Button
          variant="quiet"
          class="settings-back max-w-full justify-self-start bg-hover px-4 font-medium text-xs"
          onClick={props.close}
        >
          <ArrowLeft size={16} />
          <span class="truncate">Back to {props.backLabel}</span>
        </Button>
        <h1
          id="settings-title"
          ref={heading}
          tabindex={-1}
          class="text-xl leading-tight font-medium outline-none"
        >
          Settings
        </h1>
      </header>
      <div class="settings-layout grid min-h-0 grid-cols-[--spacing(48)_minmax(0,1fr)] items-start gap-8 max-lg:grid-cols-1 max-lg:gap-6">
        <nav
          aria-label="Settings categories"
          class="settings-navigation sticky top-0 flex flex-col gap-2 border-r border-quiet/15 bg-bg pr-4 max-lg:z-1 max-lg:flex-row max-lg:gap-3 max-lg:overflow-x-auto max-lg:border-r-0 max-lg:border-b max-lg:pr-0 max-lg:pb-2 [&>button]:relative [&>button]:min-h-12 [&>button]:justify-start [&>button]:rounded-none [&>button]:bg-transparent [&>button]:px-0 [&>button]:py-3 [&>button]:text-left [&>button]:text-sm [&>button]:font-normal [&>button]:text-muted [&>button.active]:text-ink [&>button.active]:after:absolute [&>button.active]:after:bottom-0 [&>button.active]:after:left-0 [&>button.active]:after:h-0.5 [&>button.active]:after:w-5 [&>button.active]:after:bg-accent [&>button.active]:after:content-['']"
        >
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
                aria-label={tab}
                classList={{ active: settingsTab() === tab }}
                aria-current={settingsTab() === tab ? "page" : undefined}
                onClick={() => {
                  setSettingsTab(tab);
                  panel.scrollTop = 0;
                }}
              >
                <span class="min-w-0">
                  {tab}
                  <small class="mt-1 block text-xs font-normal leading-relaxed text-quiet max-lg:hidden">
                    {sections[tab]}
                  </small>
                </span>
              </Button>
            )}
          </For>
        </nav>
        <div class="settings-content min-w-0 pb-8 [&_p]:mb-4 [&_p]:max-w-prose [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted [&_h3]:mb-3 [&_h3]:font-sans [&_h3]:text-3xl [&_h3]:font-semibold [&_h4]:mb-2 [&_h4]:text-lg [&_h4]:font-medium">
          <Show when={settingsTab() === "General"}>
            <SectionHeading>General</SectionHeading>
            <p class="muted text-muted">
              A few preferences to make Somedue your own.
            </p>
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
            <label class="check-label my-4 flex cursor-pointer items-center gap-2 text-xs leading-relaxed">
              <Checkbox
                type="checkbox"
                checked={pref("autoSync", true)}
                onChange={(e) =>
                  void preference("autoSync", e.currentTarget.checked)
                }
              />
              Sync automatically while the app is open
            </label>
            <div class="settings-group mt-8 border-t border-quiet/15 pt-5.5 [&>button]:flex [&>button]:justify-start [&>button]:text-xs [&>button]:text-accent">
              <h4>Quick Entry</h4>
              <p>
                Capture a thought from any app. Choose an unused shortcut, such
                as Control+Shift+Space.
              </p>
              <Field label="Global shortcut" hint="Leave empty to turn it off.">
                <Input
                  aria-label="Global shortcut"
                  placeholder="Control+Shift+Space"
                  value={shortcut()}
                  onInput={(e) => setShortcut(e.currentTarget.value)}
                />
              </Field>
              <Show when={state().shortcutError}>
                <p
                  role="alert"
                  class="error-text mb-4 text-xs leading-relaxed text-danger"
                >
                  {state().shortcutError}
                </p>
              </Show>
              <div class="quick-setting-actions mt-3 flex gap-2.5 [&>button]:bg-hover [&>button]:text-xs">
                <Button
                  onClick={() =>
                    void run(async () => {
                      await call("configure_shortcut", {
                        shortcut: shortcut().trim(),
                      });
                      setState(await call("load"));
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
            <div class="settings-group mt-8 border-t border-quiet/15 pt-5.5 [&>button]:flex [&>button]:justify-start [&>button]:text-xs [&>button]:text-accent">
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
            <SectionHeading>Appearance</SectionHeading>
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
            <label class="check-label my-4 flex cursor-pointer items-center gap-2 text-xs leading-relaxed">
              <Checkbox
                type="checkbox"
                checked={pref("motion", true)}
                onChange={(e) =>
                  void preference("motion", e.currentTarget.checked)
                }
              />
              Animate transitions
            </label>
            <p class="muted text-muted">
              System Reduce Motion always takes precedence.
            </p>
          </Show>
          <Show when={settingsTab() === "Things Cloud"}>
            <SectionHeading>Things Cloud</SectionHeading>
            <p class="muted text-muted">
              Connect using your Things Cloud account. Your password is stored
              only in macOS Keychain.
            </p>
            <Show
              when={state().account === "local"}
              fallback={
                <div class="account-card flex flex-col items-start gap-3 py-4 text-xs [&_svg]:text-mint [&>span]:text-xs [&>span]:text-muted [&>button]:text-accent">
                  <Cloud size={24} />
                  <strong>{state().account}</strong>
                  <span>
                    {state().lastSync
                      ? `Last sync ${new Date(state().lastSync!).toLocaleString()}`
                      : "Not yet synced"}
                  </span>
                  <span>{state().pending} pending edits</span>
                  <Button
                    onClick={() => void props.sync()}
                    disabled={props.syncing}
                  >
                    <RefreshCw size={15} />
                    Sync now
                  </Button>
                  <Button
                    onClick={() =>
                      ask(
                        "Disconnect this account? Its cached tasks and pending edits stay on this Mac. The password will be removed from Keychain.",
                        async () => {
                          setState(await call("disconnect"));
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
                  props.connect();
                }}
              >
                Connect Things Cloud
              </Button>
              <p class="small muted connect-hint text-xs text-muted mt-4 max-w-prose">
                Signing in opens your cloud workspace. Your local to-dos remain
                saved separately.
              </p>
            </Show>
            <Show when={state().blocked}>
              <div class="settings-group mt-8 border-t border-quiet/15 pt-5.5 [&>button]:flex [&>button]:justify-start [&>button]:text-xs [&>button]:text-accent">
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
            <SectionHeading>Tags</SectionHeading>
            <form
              class="tag-create mb-2.5 flex items-center gap-2 [&>input]:w-0 [&>input]:flex-1 [&>input]:text-xs"
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
              <Input
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
                <div class="tag-setting mb-2 flex min-h-8 items-center gap-2 text-muted">
                  <Pill class="min-w-0 flex-1 justify-start">
                    <Tag size={14} />
                    <Input
                      variant="plain"
                      class="h-6 min-h-6 w-0 flex-1 px-0 py-0 text-xs"
                      aria-label={`Rename tag ${title(t)}`}
                      value={title(t)}
                      onChange={(e) =>
                        void patch(t, { tt: e.currentTarget.value })
                      }
                    />
                  </Pill>
                  <IconButton
                    size="compact"
                    variant="quiet"
                    class="bg-transparent hover:bg-transparent text-quiet hover:text-danger"
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
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              )}
            </For>
          </Show>
          <Show when={settingsTab() === "Keyboard"}>
            <SectionHeading>Keyboard</SectionHeading>
            <div class="shortcuts [&>div]:flex [&>div]:items-center [&>div]:justify-between [&>div]:py-2 [&>div]:text-xs [&>div]:text-muted">
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
                    <Kbd>{row[1]}</Kbd>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <Show when={settingsTab() === "About"}>
            <img
              class="about-mark my-2.5 mb-5 grid size-16 place-items-center object-contain"
              src={appIcon}
              alt="Somedue app icon"
            />
            <SectionHeading>Somedue</SectionHeading>
            <p>A considered home for what comes next.</p>
            <p class="muted text-muted">
              Version 0.1.1
              <br />
              An independent Things Cloud client.
              <br />
              Not affiliated with Cultured Code.
            </p>
            <p class="small muted text-xs text-muted">
              Local certificate signing. Not notarized.
              <br />
              Cloud protocol is unofficial. See the repository’s verification
              record for tested behavior and limitations.
            </p>
          </Show>
        </div>
      </div>
    </section>
  );
}

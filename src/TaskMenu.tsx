import { Show, type JSX } from "solid-js";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Copy,
  Flag,
  Folder,
  Info,
  MinusCircle,
  RotateCw,
  Share2,
  Tag,
  Trash2,
  X,
} from "lucide-solid";
import { Kbd, Menu, MenuDivider, MenuItem, MenuSubmenu } from "./ui";

export type TaskAction =
  | "when"
  | "move"
  | "tags"
  | "deadline"
  | "complete"
  | "cancel"
  | "reopen"
  | "repeat"
  | "info"
  | "duplicate"
  | "convert"
  | "delete"
  | "removeProject"
  | "showProject"
  | "share"
  | "today"
  | "evening"
  | "anytime"
  | "someday";

export default function TaskMenu(props: {
  multiple?: boolean;
  project?: boolean;
  inProject?: boolean;
  completed?: boolean;
  close: () => void;
  action: (action: TaskAction) => void;
  children?: JSX.Element;
}) {
  const act = (action: TaskAction) => {
    props.close();
    props.action(action);
  };
  return (
    <Menu close={props.close} aria-label="To-do actions">
      <MenuItem onClick={() => act("when")}>
        <CalendarDays size={16} />
        When…
      </MenuItem>
      <MenuItem onClick={() => act("move")}>
        <ArrowRight size={16} />
        Move…
      </MenuItem>
      <MenuItem onClick={() => act("tags")}>
        <Tag size={16} />
        Tags…
      </MenuItem>
      <MenuItem onClick={() => act("deadline")}>
        <Flag size={16} />
        Deadline…
      </MenuItem>
      <MenuSubmenu label="Complete">
        {(close) => (
          <>
            <MenuItem
              onClick={() => {
                close();
                act("complete");
              }}
            >
              <Check size={16} />
              Complete<Kbd>⌘ K</Kbd>
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                act("cancel");
              }}
            >
              <X size={16} />
              Cancel To-Do<Kbd>⌥ ⌘ K</Kbd>
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                act("reopen");
              }}
            >
              Mark Incomplete
            </MenuItem>
          </>
        )}
      </MenuSubmenu>
      <MenuSubmenu label="Shortcuts">
        {(close) => (
          <>
            <MenuItem
              onClick={() => {
                close();
                act("today");
              }}
            >
              Today<Kbd>⌘ T</Kbd>
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                act("evening");
              }}
            >
              This Evening<Kbd>⌘ E</Kbd>
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                act("anytime");
              }}
            >
              Anytime<Kbd>⌘ R</Kbd>
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                act("someday");
              }}
            >
              Someday<Kbd>⌘ O</Kbd>
            </MenuItem>
          </>
        )}
      </MenuSubmenu>
      <MenuDivider />
      <Show when={!props.multiple}>
        <MenuItem onClick={() => act("repeat")}>
          <RotateCw size={16} />
          Repeat…
        </MenuItem>
        <MenuItem onClick={() => act("info")}>
          <Info size={16} />
          Get Info
        </MenuItem>
        <MenuItem onClick={() => act("duplicate")}>
          <Copy size={16} />
          Duplicate {props.project ? "Project" : "To-Do"}
        </MenuItem>
        <Show when={!props.project}>
          <MenuItem onClick={() => act("convert")}>
            <Folder size={16} />
            Convert to Project…
          </MenuItem>
        </Show>
      </Show>
      <MenuItem onClick={() => act("delete")}>
        <Trash2 size={16} />
        Delete {props.multiple ? "To-Dos" : props.project ? "Project" : "To-Do"}
      </MenuItem>
      <Show when={props.inProject}>
        <MenuDivider />
        <MenuItem onClick={() => act("removeProject")}>
          <MinusCircle size={16} />
          Remove From Project
        </MenuItem>
        <Show when={!props.multiple}>
          <MenuDivider />
          <MenuItem onClick={() => act("showProject")}>
            <Folder size={16} />
            Show in Project
          </MenuItem>
        </Show>
      </Show>
      <Show when={!props.multiple}>
        <MenuItem onClick={() => act("share")}>
          <Share2 size={16} />
          Share…
        </MenuItem>
      </Show>
      <Show when={props.children}>
        <MenuDivider />
        {props.children}
      </Show>
    </Menu>
  );
}

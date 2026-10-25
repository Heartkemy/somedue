import type { Entity } from "./model";

export type EditorSession<T> = { item: Entity; read: () => T };

export function createEditorSaves<T>() {
  const drafts = new Map<string, EditorSession<T>>();
  let pending: Promise<unknown> = Promise.resolve();
  return {
    drafts,
    retain(item: Entity, read: () => T): EditorSession<T> {
      const session = { item: drafts.get(item.id)?.item || item, read };
      drafts.set(item.id, session);
      return session;
    },
    release(session: EditorSession<T>) {
      if (drafts.get(session.item.id) === session)
        drafts.delete(session.item.id);
    },
    unchanged(session: EditorSession<T>, snapshot: T) {
      return (
        drafts.get(session.item.id) === session &&
        JSON.stringify(session.read()) === JSON.stringify(snapshot)
      );
    },
    enqueue<R>(save: () => Promise<R>): Promise<R> {
      const result = pending.then(save, save);
      pending = result;
      return result;
    },
  };
}

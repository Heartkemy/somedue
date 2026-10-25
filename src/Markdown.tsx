import { createMemo } from "solid-js";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { call } from "./api";
export default function Markdown(props: {
  text: string;
  onError: (message: string) => void;
}) {
  const html = createMemo(() =>
    DOMPurify.sanitize(
      marked.parse(props.text, { async: false, gfm: true, breaks: true }),
      {
        ALLOWED_TAGS: [
          "p",
          "br",
          "strong",
          "em",
          "del",
          "s",
          "code",
          "pre",
          "blockquote",
          "ul",
          "ol",
          "li",
          "h1",
          "h2",
          "h3",
          "h4",
          "hr",
          "a",
          "table",
          "thead",
          "tbody",
          "tr",
          "th",
          "td",
        ],
        ALLOWED_ATTR: ["href", "title"],
      },
    ),
  );
  return (
    <div
      class="markdown"
      innerHTML={html()}
      onClick={(event) => {
        const link = (event.target as HTMLElement).closest("a");
        if (link) {
          event.preventDefault();
          void call("open_link", { url: link.href }).catch((e) =>
            props.onError(String(e)),
          );
        }
      }}
    />
  );
}

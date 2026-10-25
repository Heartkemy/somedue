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
      class="markdown py-4 text-sm leading-relaxed text-muted wrap-anywhere [&_p]:mb-2.5 [&_:is(h1,h2,h3,h4)]:mt-3.5 [&_:is(h1,h2,h3,h4)]:mb-2 [&_:is(h1,h2,h3,h4)]:font-sans [&_:is(h1,h2,h3,h4)]:text-base [&_:is(h1,h2,h3,h4)]:font-semibold [&_:is(h1,h2,h3,h4)]:text-ink [&_:is(ul,ol)]:my-2 [&_:is(ul,ol)]:pl-6 [&_ul]:list-disc [&_ol]:list-decimal [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:bg-hover [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-field [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_blockquote]:border-l-2 [&_blockquote]:border-quiet [&_blockquote]:pl-3.5 [&_blockquote]:italic [&_hr]:my-4 [&_hr]:border-quiet/20 [&_table]:w-full [&_table]:border-collapse [&_:is(th,td)]:border-b [&_:is(th,td)]:border-quiet/15 [&_:is(th,td)]:px-2 [&_:is(th,td)]:py-1 [&_:is(th,td)]:text-left"
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

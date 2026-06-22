import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Render Markdown with the app's design tokens. HTML in the source is NOT
 * rendered (no rehype-raw) and react-markdown sanitizes dangerous URLs, so a
 * skill body - even an untrusted one - can't inject markup or `javascript:`
 * links. Used to preview skill instructions in read mode; edit mode shows raw.
 *
 * Each override forwards only the props it needs (children / href / className)
 * rather than spreading, so react-markdown's internal `node` prop never lands
 * on a DOM element.
 */
const COMPONENTS: Components = {
  h1: ({ children }) => <h1 className="mt-4 mb-2 font-semibold text-xl first:mt-0">{children}</h1>,
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2 border-border border-b pb-1 font-semibold text-lg first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-1.5 font-semibold text-base first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => <h4 className="mt-3 mb-1 font-semibold text-sm first:mt-0">{children}</h4>,
  p: ({ children }) => (
    <p className="my-2 text-sm leading-relaxed first:mt-0 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1 text-sm">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1 text-sm">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ children, href }) => (
    <a
      className="font-medium text-brand-green underline underline-offset-2"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-border border-l-2 pl-3 text-muted-foreground text-sm italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ className, children }) => {
    // A fenced block carries a `language-*` class; inline code does not. Inline
    // gets a chip; block code stays bare so the surrounding <pre> styles it.
    const isBlock = typeof className === "string" && className.includes("language-");
    if (isBlock) return <code className={cn("font-mono text-xs", className)}>{children}</code>;
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-muted/40 px-3 py-1.5 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-border px-3 py-1.5">{children}</td>,
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("min-w-0 text-foreground", className)}>
      <ReactMarkdown components={COMPONENTS} remarkPlugins={[remarkGfm]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

import { Fragment, type ReactNode } from "react";

type MarkerMatch =
  | { kind: "bold"; close: string; className?: string }
  | { kind: "quote"; close: string; className: string };

function getMarkerMatch(text: string, index: number): MarkerMatch | null {
  if (text.startsWith("**", index)) {
    return { kind: "bold", close: "**" };
  }

  if (text[index] === "\"") {
    return { kind: "quote", close: "\"", className: "chat-inline-quote" };
  }

  if (text[index] === "“") {
    return { kind: "quote", close: "”", className: "chat-inline-quote" };
  }

  return null;
}

function renderSegments(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const marker = getMarkerMatch(text, cursor);
    if (!marker) {
      let next = cursor + 1;
      while (next < text.length && !getMarkerMatch(text, next)) {
        next += 1;
      }

      nodes.push(text.slice(cursor, next));
      cursor = next;
      continue;
    }

    const start = cursor + marker.close.length;
    const end = text.indexOf(marker.close, start);

    if (end === -1) {
      nodes.push(text.slice(cursor, cursor + marker.close.length));
      cursor += marker.close.length;
      continue;
    }

    const inner = text.slice(start, end);
    const children = renderSegments(inner);
    const key = `${marker.kind}-${cursor}-${end}`;

    if (marker.kind === "bold") {
      nodes.push(<strong key={key}>{children}</strong>);
    } else {
      nodes.push(
        <span key={key} className={marker.className}>
          {marker.close === "\"" ? "\"" : "“"}
          {children}
          {marker.close}
        </span>,
      );
    }

    cursor = end + marker.close.length;
  }

  return nodes;
}

export function RichText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);

  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={`line-${index}`}>
          {index > 0 && <br />}
          {renderSegments(line)}
        </Fragment>
      ))}
    </>
  );
}

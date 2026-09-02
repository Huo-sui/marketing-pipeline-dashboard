export type AndroidUiNode = {
  text: string;
  desc: string;
  className: string;
  selected: boolean;
  checked: boolean;
  bounds?: { left: number; top: number; right: number; bottom: number };
};

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .trim();
}

export function androidUiNodes(xml: string): AndroidUiNode[] {
  return [...xml.matchAll(/<(?:node|android\.[^\s>]+)\b[^>]*>/g)].map((match) => {
    const tag = match[0];
    const bounds = tag.match(/\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    return {
      text: decodeXml(tag.match(/\btext="([^"]*)"/)?.[1] ?? ""),
      desc: decodeXml(tag.match(/\bcontent-desc="([^"]*)"/)?.[1] ?? ""),
      className: decodeXml(tag.match(/\bclass="([^"]*)"/)?.[1] ?? match[0].match(/^<([^\s>]+)/)?.[1] ?? ""),
      selected: tag.match(/\bselected="([^"]*)"/)?.[1] === "true",
      checked: tag.match(/\bchecked="([^"]*)"/)?.[1] === "true",
      bounds: bounds ? { left: Number(bounds[1]), top: Number(bounds[2]), right: Number(bounds[3]), bottom: Number(bounds[4]) } : undefined,
    };
  });
}

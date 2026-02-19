import type { Mark, MarkType, ResolvedPos } from "prosemirror-model";

/**
 * Find the contiguous range of a mark containing the given position.
 * Returns null if the position isn't inside a mark of the specified type.
 */
export function getMarkRange(
  $pos: ResolvedPos,
  markType: MarkType,
): { from: number; to: number; mark: Mark } | null {
  let start = $pos.parent.childAfter($pos.parentOffset);
  if (!start.node) start = $pos.parent.childBefore($pos.parentOffset);
  const node = start.node;
  const mark = node?.marks.find((m) => m.type === markType);
  if (!mark || !node) return null;

  let startIndex = start.index,
    startPos = $pos.start() + start.offset;
  let endIndex = startIndex + 1,
    endPos = startPos + node.nodeSize;

  while (
    startIndex > 0 &&
    mark.isInSet($pos.parent.child(startIndex - 1).marks)
  ) {
    startPos -= $pos.parent.child(--startIndex).nodeSize;
  }
  while (
    endIndex < $pos.parent.childCount &&
    mark.isInSet($pos.parent.child(endIndex).marks)
  ) {
    endPos += $pos.parent.child(endIndex++).nodeSize;
  }
  return { from: startPos, to: endPos, mark };
}

/**
 * Find the contiguous range of a link mark containing the given position.
 * Returns null if the position isn't inside a link.
 */
export function getLinkRange(
  $pos: ResolvedPos,
  linkType: MarkType,
): { from: number; to: number; href: string } | null {
  const range = getMarkRange($pos, linkType);
  return (
    range && {
      from: range.from,
      to: range.to,
      href: range.mark.attrs.href as string,
    }
  );
}

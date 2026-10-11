import type { Direction, Point } from "../shared/types";
import type { PhysicalSide, ResolvedSide, StickySide } from "./types";
import { ROOT_NAME, STUCK_TOLERANCE } from "./constants";

function toPhysical(side: StickySide, direction: Direction): PhysicalSide {
  switch (side) {
    case "inline-start":
      return direction === "rtl" ? "right" : "left";
    case "inline-end":
      return direction === "rtl" ? "left" : "right";
    default:
      return side;
  }
}

export function resolveSides(sides: readonly StickySide[], direction: Direction): ResolvedSide[] {
  if (sides.length === 0) {
    throw new Error(`${ROOT_NAME} needs at least one side to stick to.`);
  }
  const resolved = sides.map(side => ({ side, physical: toPhysical(side, direction) }));
  if (new Set(resolved.map(entry => entry.physical)).size !== resolved.length) {
    throw new Error(`${ROOT_NAME} names the same side more than once: ${sides.join(", ")}.`);
  }
  return resolved;
}

/**
 * The sides an element is stuck to, given how far sticking moved it from where it sits in
 * normal flow: an element stuck to the top has moved down, one stuck to the right has moved
 * left, and so on.
 */
export function stuckSides(displacement: Point, sides: readonly ResolvedSide[]): StickySide[] {
  const moved: Record<PhysicalSide, boolean> = {
    top: displacement.y > STUCK_TOLERANCE,
    bottom: displacement.y < -STUCK_TOLERANCE,
    left: displacement.x > STUCK_TOLERANCE,
    right: displacement.x < -STUCK_TOLERANCE,
  };
  return sides.filter(entry => moved[entry.physical]).map(entry => entry.side);
}

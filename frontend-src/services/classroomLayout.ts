export interface ClassroomPosition { x: number; y: number }
export const GRID_STEP = 5;

export const snapClassroomPosition = ({ x, y }: ClassroomPosition): ClassroomPosition => ({
  x: Math.max(2, Math.min(98, Math.round(x / GRID_STEP) * GRID_STEP)),
  y: Math.max(4, Math.min(96, Math.round(y / GRID_STEP) * GRID_STEP)),
});

// Una única traslación mantiene las distancias incluso al llegar al borde.
export const moveClassroomGroup = (
  positions: Record<string, ClassroomPosition>, anchorId: string,
  delta: ClassroomPosition, snap: boolean,
): Record<string, ClassroomPosition> => {
  const points = Object.values(positions);
  if (!points.length) return {};
  let { x: dx, y: dy } = delta;
  const anchor = positions[anchorId];
  if (snap && anchor) {
    const target = snapClassroomPosition({ x: anchor.x + dx, y: anchor.y + dy });
    dx = target.x - anchor.x;
    dy = target.y - anchor.y;
  }
  dx = Math.max(2 - Math.min(...points.map(p => p.x)), Math.min(98 - Math.max(...points.map(p => p.x)), dx));
  dy = Math.max(4 - Math.min(...points.map(p => p.y)), Math.min(96 - Math.max(...points.map(p => p.y)), dy));
  return Object.fromEntries(Object.entries(positions).map(([id, pos]) => [id, { x: pos.x + dx, y: pos.y + dy }]));
};

export const selectClassroomRectangle = (
  positions: Record<string, ClassroomPosition>, start: ClassroomPosition, end: ClassroomPosition,
): string[] => Object.entries(positions)
  .filter(([, pos]) => pos.x >= Math.min(start.x, end.x) && pos.x <= Math.max(start.x, end.x) &&
    pos.y >= Math.min(start.y, end.y) && pos.y <= Math.max(start.y, end.y))
  .map(([id]) => id);

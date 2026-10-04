import { describe, expect, it } from 'vitest';
import { moveClassroomGroup, selectClassroomRectangle, snapClassroomPosition } from './classroomLayout';

describe('plano de clase', () => {
  const positions = { a: { x: 20, y: 30 }, b: { x: 40, y: 50 } };
  it('mueve el grupo conservando distancias y el punto donde empezó el arrastre', () => {
    expect(moveClassroomGroup(positions, 'a', { x: 12, y: -3 }, false))
      .toEqual({ a: { x: 32, y: 27 }, b: { x: 52, y: 47 } });
  });
  it('limita el grupo al borde sin apilar a los alumnos', () => {
    expect(moveClassroomGroup(positions, 'a', { x: 100, y: -100 }, false))
      .toEqual({ a: { x: 78, y: 4 }, b: { x: 98, y: 24 } });
  });
  it('ajusta el ancla a cuadrícula conservando la separación del grupo', () => {
    expect(moveClassroomGroup({ a: { x: 21, y: 32 }, b: { x: 38, y: 49 } }, 'a', { x: 8, y: 9 }, true))
      .toEqual({ a: { x: 30, y: 40 }, b: { x: 47, y: 57 } });
  });
  it('alinea posiciones y respeta los límites del lienzo', () => {
    expect(snapClassroomPosition({ x: 22, y: 38 })).toEqual({ x: 20, y: 40 });
    expect(snapClassroomPosition({ x: -12, y: 130 })).toEqual({ x: 2, y: 96 });
  });
  it('selecciona por centros con recuadros en cualquier dirección', () => {
    expect(selectClassroomRectangle(positions, { x: 45, y: 55 }, { x: 15, y: 25 })).toEqual(['a', 'b']);
    expect(selectClassroomRectangle(positions, { x: 0, y: 0 }, { x: 25, y: 35 })).toEqual(['a']);
  });
  it('admite grupos y selección vacíos', () => {
    expect(moveClassroomGroup({}, 'a', { x: 2, y: 4 }, true)).toEqual({});
    expect(selectClassroomRectangle({}, { x: 0, y: 0 }, { x: 100, y: 100 })).toEqual([]);
  });
});

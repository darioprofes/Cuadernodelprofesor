// Motor de cálculo de calificaciones, dividido por responsabilidad en vez de
// un único archivo de ~650 líneas mezclando las tres:
//   - shared.ts: color por nota, usado por los tres motores.
//   - tools.ts: puntuación de instrumentos (checklist/escala/rúbrica).
//   - categoryEngine.ts: motor Categorías (tradicional, de comparación).
//   - criterialEngine.ts: motor Criterios (oficial, LOMLOE).
// Este archivo solo reexporta — el resto de la app sigue importando desde
// 'services/gradeCalculations' sin cambios.
export * from './shared';
export * from './tools';
export * from './categoryEngine';
export * from './criterialEngine';

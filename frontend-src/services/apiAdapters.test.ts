import { describe, expect, it } from 'vitest';
import { decodeGrade, encodeGradeInput } from './apiAdapters';

const assignment = { id: 'activity', evaluationMethod: 'question_round' as const,
  linkedCriteria: [{ criterionId: 'c1', ratio: 1, selectedDescriptorIds: [] }, { criterionId: 'c2', ratio: 1, selectedDescriptorIds: [] }] };

describe('compatibilidad de rondas antiguas', () => {
  it('lee la media antigua sin perder el historial', () => {
    const history = [{ id: 'entry', score: 6 }];
    const result = decodeGrade({ directScore: 6, toolResults: { questionRoundEntries: history } }, 'a', assignment, []);
    expect(result.criterionScores).toEqual({ c1: 6, c2: 6 });
    expect(result.toolResults?.questionRoundEntries).toEqual(history);
  });
  it('recupera las notas por criterio guardadas con el formulario normal', () => {
    const encoded = encodeGradeInput({ criterionScores: { c1: 0, c2: 8 } });
    expect(decodeGrade(encoded, 'a', assignment, []).criterionScores)
      .toEqual({ c1: 0, c2: 8 });
  });
  it('mantiene la edición de nota única en rondas sin criterios', () => {
    const encoded = encodeGradeInput({ criterionScores: { direct_score: 0 } });
    expect(decodeGrade(encoded, 'a', { ...assignment, linkedCriteria: [] }, []).criterionScores)
      .toEqual({ direct_score: 0 });
  });
});

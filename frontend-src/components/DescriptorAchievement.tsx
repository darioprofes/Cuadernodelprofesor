
import React, { useMemo } from 'react';
import type { ClassData, KeyCompetence, Course } from '../types';
import { TYPOGRAPHY } from '../theme/typography';
import EmptyState from './EmptyState';

interface DescriptorAchievementProps {
  classData: ClassData;
  keyCompetences: KeyCompetence[];
  courses: Course[];
}

const DescriptorAchievement: React.FC<DescriptorAchievementProps> = ({ classData, keyCompetences, courses }) => {

  const usedDescriptorIds = useMemo(() => {
    const descriptorIds = new Set<string>();
    for (const assignment of classData.assignments) {
      for (const linkedCriterion of assignment.linkedCriteria) {
        if (linkedCriterion.selectedDescriptorIds) {
          for (const descriptorId of linkedCriterion.selectedDescriptorIds) {
            descriptorIds.add(descriptorId);
          }
        }
      }
    }
    return descriptorIds;
  }, [classData]);

  const selectedStageSuffix = useMemo(() => {
    const course = courses.find(c => c.id === classData.courseId);
    if (!course) return null;
    // FIX: Use robust regex to correctly identify Bachillerato stage regardless of casing or partial names like "Bach".
    return /bach/i.test(course.level) ? '-bach' : '-eso';
  }, [classData, courses]);

  // A diferencia de los otros informes (alumno × criterio/competencia), este
  // no es por alumno: es un chequeo a nivel de TODA la clase de qué
  // descriptores operativos del currículo ya se han vinculado a alguna
  // tarea este curso (en cualquier alumno) y cuáles no — para detectar
  // huecos de programación, no para calificar.
  const bloques = keyCompetences
    .map(kc => ({
        kc,
        descriptores: (kc.descriptors || []).filter(d =>
            !selectedStageSuffix || // show all if no course selected (fallback)
            d.id.endsWith(selectedStageSuffix) || // show if matches stage
            (!d.id.endsWith('-eso') && !d.id.endsWith('-bach')) // always show generic ones
        ),
    }))
    .filter(b => b.descriptores.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className={TYPOGRAPHY.pageTitle}>Cobertura de Descriptores Operativos</h2>
        <p className={`${TYPOGRAPHY.body} mt-1`}>
            Vista de toda la clase (no por alumno): qué descriptores del currículo ya se han trabajado en alguna tarea este curso y cuáles no, para detectar huecos de programación.
        </p>
      </div>

      {bloques.length === 0 ? (
        <EmptyState
            title="No hay descriptores operativos definidos para este curso."
            message="Se añaden en Ajustes → Currículo, dentro de cada competencia clave."
        />
      ) : (
        <>
            <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-100 border border-green-200 inline-block" /> Trabajado en alguna tarea</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-50 border border-slate-200 inline-block" /> Todavía no trabajado</span>
            </div>
            {bloques.map(({ kc, descriptores }) => (
                <div key={kc.id} className="p-4 border border-slate-200 rounded-lg bg-white">
                    <h3 className="text-lg font-semibold text-slate-700 mb-3">{kc.code} - {kc.description}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {descriptores.map(descriptor => {
                        const isUsed = usedDescriptorIds.has(descriptor.id);
                        return (
                            <div
                            key={descriptor.id}
                            className={`p-3 rounded-md transition-colors duration-200 ${
                                isUsed ? 'bg-green-100' : 'bg-slate-50'
                            }`}
                            title={isUsed ? 'Este descriptor ha sido trabajado en al menos una tarea.' : 'Este descriptor no ha sido trabajado todavía.'}
                            >
                            <p className="font-bold text-sm text-slate-800">{descriptor.code}</p>
                            <p className="text-xs text-slate-600 mt-1">{descriptor.description}</p>
                            </div>
                        );
                        })}
                    </div>
                </div>
            ))}
        </>
      )}
    </div>
  );
};

export default DescriptorAchievement;

import React, { useMemo, useState } from 'react';
import type { ClassData, EvaluationCriterion, SpecificCompetence, AcademicConfiguration, Student } from '../types';
import { calculateStudentCriterionGrades, getGradeColorClass } from '../services/gradeCalculations';
import { getNombreCompleto } from '../utils';
import { TYPOGRAPHY } from '../theme/typography';
import DrilldownModal, { DrilldownData } from './DrilldownModal';
import Select from './Select';

interface CriteriaAchievementProps {
  classData: ClassData;
  criteria: EvaluationCriterion[];
  competences: SpecificCompetence[];
  academicConfiguration: AcademicConfiguration;
}

const CriteriaAchievement: React.FC<CriteriaAchievementProps> = ({ classData, criteria, competences, academicConfiguration }) => {
    const [selectedPeriodId, setSelectedPeriodId] = useState<string>('all');
    const { evaluationPeriods } = academicConfiguration;
    const [drilldownData, setDrilldownData] = useState<DrilldownData | null>(null);
    
    const studentCriterionGrades = useMemo(() => {
        const studentGrades = new Map<string, Map<string, number | null>>();
        for (const student of classData.students) {
            studentGrades.set(student.id, calculateStudentCriterionGrades(student.id, classData, criteria, selectedPeriodId === 'all' ? undefined : selectedPeriodId));
        }
        return studentGrades;
    }, [classData, criteria, selectedPeriodId]);

    const classAverageGrades = useMemo(() => {
        const averages = new Map<string, number | null>();
        for (const criterion of criteria) {
            const studentGrades = classData.students
                .map(s => studentCriterionGrades.get(s.id)?.get(criterion.id))
                .filter(g => g !== null && g !== undefined) as number[];
            
            if (studentGrades.length === 0) {
                averages.set(criterion.id, null);
            } else {
                const sum = studentGrades.reduce((acc, grade) => acc + grade, 0);
                averages.set(criterion.id, sum / studentGrades.length);
            }
        }
        return averages;
    }, [criteria, classData.students, studentCriterionGrades]);

    const handleCellClick = (student: Student, criterion: EvaluationCriterion) => {
        const finalGrade = studentCriterionGrades.get(student.id)?.get(criterion.id) ?? null;
    
        const gradesForCriterion = classData.grades.filter(g => 
            g.studentId === student.id && 
            g.criterionScores &&
            g.criterionScores[criterion.id] != null
        );
    
        const items = gradesForCriterion.map(grade => {
            const assignment = classData.assignments.find(a => a.id === grade.assignmentId);
            return {
                name: assignment?.name || 'Tarea desconocida',
                grade: grade.criterionScores[criterion.id] as number | null,
            }
        });
    
        setDrilldownData({
            studentName: getNombreCompleto(student),
            elementName: `Criterio ${criterion.code}: ${criterion.description}`,
            items: items,
            finalGrade: finalGrade,
        });
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5 overflow-hidden">
             <div className="flex justify-between items-center mb-4">
                <h2 className={TYPOGRAPHY.pageTitle}>Grado de Consecución de Criterios</h2>
                <div>
                    <Select
                        value={selectedPeriodId}
                        onChange={(e) => setSelectedPeriodId(e.target.value)}
                    >
                        <option value="all">Curso Completo</option>
                        {evaluationPeriods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left text-slate-500">
                    <thead className="text-xs text-slate-700 uppercase bg-slate-100 sticky top-0 z-20">
                        <tr>
                            <th scope="col" className="px-6 py-3 font-semibold sticky left-0 bg-slate-100 z-30 w-52">Alumn@</th>
                            {criteria.map(criterion => (
                                <th key={criterion.id} scope="col" className="px-3 py-3 font-semibold min-w-[120px] text-center" title={criterion.description}>
                                    <div className="font-bold">{criterion.code}</div>
                                    <div className="font-normal text-slate-500">{competences.find(c => c.id === criterion.competenceId)?.code}</div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {classData.students.map((student, index) => (
                            <tr key={student.id} className="bg-white border-b border-slate-200/80 hover:bg-slate-50/50">
                                <td className="px-6 py-3 font-medium text-slate-900 sticky left-0 bg-white hover:bg-slate-50/50 z-10 w-52 flex items-center gap-2">
                                    <span className="text-xs text-slate-400 font-mono w-5 text-right">{index + 1}</span>
                                    <span>{getNombreCompleto(student)}</span>
                                </td>
                                {criteria.map(criterion => {
                                    const grade = studentCriterionGrades.get(student.id)?.get(criterion.id) ?? null;
                                    const styleClass = getGradeColorClass(grade, academicConfiguration.gradeScale);
                                    return (
                                        <td key={criterion.id} className={`px-3 py-2 text-center font-bold text-base cursor-pointer ${styleClass}`} onClick={() => handleCellClick(student, criterion)}>
                                            {grade !== null ? grade.toFixed(2) : '-'}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-slate-100 border-t-2 border-slate-300 sticky bottom-0">
                            <td className="px-6 py-3 font-bold text-slate-800 sticky left-0 bg-slate-100 z-10 w-52">Media de la Clase</td>
                            {criteria.map(criterion => {
                                const avgGrade = classAverageGrades.get(criterion.id) ?? null;
                                const styleClass = getGradeColorClass(avgGrade, academicConfiguration.gradeScale);
                                return (
                                    <td key={criterion.id} className={`px-3 py-2 text-center font-bold text-base ${styleClass}`}>
                                        {avgGrade !== null ? avgGrade.toFixed(2) : '-'}
                                    </td>
                                );
                            })}
                        </tr>
                    </tfoot>
                </table>
            </div>
            <DrilldownModal 
                isOpen={!!drilldownData} 
                onClose={() => setDrilldownData(null)} 
                data={drilldownData} 
                gradeScale={academicConfiguration.gradeScale}
            />
        </div>
    );
};

export default CriteriaAchievement;

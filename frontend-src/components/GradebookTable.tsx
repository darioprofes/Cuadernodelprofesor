
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { ClassData, Student, Assignment, Grade, EvaluationCriterion, Category, SpecificCompetence, KeyCompetence, ProgrammingUnit, AcademicConfiguration, EvaluationTool, Course } from '../types';
import { PlusIcon, PencilIcon, TrashIcon, BookOpenIcon, ArrowUpTrayIcon, DocumentDuplicateIcon, TableCellsIcon, Bars3Icon, ArrowUpIcon, ArrowDownIcon } from './Icons';
import IconButton from './IconButton';
import Select from './Select';
import Badge from './Badge';
import { linkHoverClassName } from '../theme/components/Link';
import { SEMANTIC } from '../theme/palette';
import { pageHeaderMinHeight } from '../theme/components/PageHeader';
import { headerPatternStyle } from '../theme/headerPattern';
import AssignmentModal from './AssignmentModal';
import GradeEntryModal from './GradeEntryModal';
import CategoryModal from './CategoryModal';
import AcneaeTag from './AcneaeTag';
import { calculateAssignmentScoresForStudent, calculateEvaluationPeriodGradeForStudent, calculateOverallFinalGradeForStudent, calculateCriterionScoresFromTool, getGradeColorClass, calculatePeriodGradeCriterial, calculateFinalGradeCriterial, calculateCategoryAverageForStudent } from '../services/gradeCalculations';
import BulkGradeImportModal from './BulkGradeImportModal';
import StudentSummaryModal from './StudentSummaryModal';
import CopyAssignmentModal from './CopyAssignmentModal';
import ClassLabel from './ClassLabel';
import { formatClassLabel, getClassName, getMateria, getClassAccentColor } from '../utils';


interface GradebookTableProps {
  classData: ClassData;
  allClasses: ClassData[];
  allCourses: Course[];
  criteria: EvaluationCriterion[];
  specificCompetences: SpecificCompetence[];
  keyCompetences: KeyCompetence[];
  programmingUnits: ProgrammingUnit[];
  academicConfiguration: AcademicConfiguration;
  setAcademicConfiguration: (updater: React.SetStateAction<AcademicConfiguration>) => void;
  onUpdateClass: (updatedClass: ClassData) => void;
  evaluationTools: EvaluationTool[];
  setActiveClassId?: (id: string) => void; // Optional setter to change active class from tabs
  onCopyAssignment: (sourceAssignment: Assignment, targetClassId: string, targetPeriodId: string, targetCategoryId: string) => void;
}

const getGradeStyleClasses = (grade: number | null, config?: AcademicConfiguration) => {
    return getGradeColorClass(grade, config?.gradeScale);
};

const toYYYYMMDD = (date: Date): string => {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const GradebookTable: React.FC<GradebookTableProps> = (props) => {
  const { classData, allClasses, allCourses, criteria, specificCompetences, keyCompetences, programmingUnits, academicConfiguration, onUpdateClass, evaluationTools, onCopyAssignment } = props;
  const { evaluationPeriods } = academicConfiguration;
  
  // Initialize with a dummy value, will be set by useEffect
  const [activePeriodId, setActivePeriodId] = useState<string>('final');
  const [hasAutoSelectedPeriod, setHasAutoSelectedPeriod] = useState(false);

  // Densidad de la tabla: preferencia puramente visual (no es dato de
  // dominio, así que vive en localStorage, no en el blob SQLite). El
  // Cuaderno es la pantalla más densa y más usada de la app; "compacta"
  // ayuda cuando hay muchas tareas/columnas y hace falta ver más de un
  // vistazo, a costa de celdas más pequeñas.
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    const stored = localStorage.getItem('gradebookDensity');
    return stored === 'compact' ? 'compact' : 'comfortable';
  });
  useEffect(() => {
    localStorage.setItem('gradebookDensity', density);
  }, [density]);
  const isCompact = density === 'compact';
  const cellPad = isCompact ? 'p-1' : 'p-2';
  const headerPad = isCompact ? 'p-2' : 'p-3';
  const studentCellPad = isCompact ? 'px-3 py-1' : 'px-3 py-2';
  const studentHeaderPad = isCompact ? 'px-4 py-2' : 'px-4 py-3';
  
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [assignmentToEdit, setAssignmentToEdit] = useState<Assignment | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null);
  
  const [isGradeEntryModalOpen, setIsGradeEntryModalOpen] = useState(false);
  const [gradeEntryData, setGradeEntryData] = useState<{ student: Student; assignment: Assignment; grade: Grade | null } | null>(null);
  
  const [isCopyCatOpen, setIsCopyCatOpen] = useState(false);
  const [selectedSourceClassId, setSelectedSourceClassId] = useState<string>(classData.id);
  const copyCatRef = useRef<HTMLDivElement>(null);

  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
  const [assignmentForImport, setAssignmentForImport] = useState<Assignment | null>(null);

  // State for Student Summary Modal
  const [selectedStudentForSummary, setSelectedStudentForSummary] = useState<Student | null>(null);

  // State for Copy Assignment Modal
  const [assignmentToCopy, setAssignmentToCopy] = useState<Assignment | null>(null);

  // Auto-select the current period based on date
  useEffect(() => {
      if (!hasAutoSelectedPeriod && evaluationPeriods.length > 0) {
          const today = toYYYYMMDD(new Date());
          const currentPeriod = evaluationPeriods.find(p => today >= p.startDate && today <= p.endDate);
          
          if (currentPeriod) {
              setActivePeriodId(currentPeriod.id);
          } else {
              // If not in any period range, check if year ended
              const yearEnd = academicConfiguration.academicYearEnd;
              if (yearEnd && today > yearEnd) {
                  setActivePeriodId('final');
              } else {
                  // Default to first period or final if none match
                  setActivePeriodId(evaluationPeriods[0]?.id || 'final');
              }
          }
          setHasAutoSelectedPeriod(true);
      }
  }, [evaluationPeriods, academicConfiguration.academicYearEnd, hasAutoSelectedPeriod]);

  useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
          if (copyCatRef.current && !copyCatRef.current.contains(event.target as Node)) {
              setIsCopyCatOpen(false);
          }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
          document.removeEventListener("mousedown", handleClickOutside);
      };
  }, [copyCatRef]);

  useEffect(() => {
      if (isCopyCatOpen) {
          setSelectedSourceClassId(classData.id);
      }
  }, [isCopyCatOpen, classData.id]);

  const gradesMap = useMemo(() => {
    const map = new Map<string, Grade>();
    classData.grades.forEach(grade => {
      map.set(`${grade.studentId}-${grade.assignmentId}`, grade);
    });
    return map;
  }, [classData.grades]);
  
  // Reparto igual vs manual entre criterios: opción global de la materia,
  // configurada en Ajustes → Currículo.
  const repartoIgualCriterios = !allCourses.find((c: Course) => c.id === classData.courseId)?.pesoCriteriosManual;

  // Nota "oficial" (motor de criterios, LOMLOE): la que se muestra en
  // grande. Se calcula siempre a partir de los criterios de evaluación, no
  // de las categorías/actividades directamente.
  const studentPeriodGradesCriterial = useMemo(() => {
    const periodGrades = new Map<string, Map<string, { grade: number | null; styleClasses: string }>>();
    for (const student of classData.students) {
        const studentGrades = new Map<string, { grade: number | null; styleClasses: string }>();
        evaluationPeriods.forEach(period => {
            studentGrades.set(period.id, calculatePeriodGradeCriterial(student.id, classData, criteria, period.id, repartoIgualCriterios, academicConfiguration.gradeScale));
        });
        periodGrades.set(student.id, studentGrades);
    }
    return periodGrades;
  }, [classData, criteria, evaluationPeriods, repartoIgualCriterios, academicConfiguration.gradeScale]);

  const studentFinalGradesCriterial = useMemo(() => {
      const finalGrades = new Map<string, { grade: number | null; styleClasses: string }>();
      for (const student of classData.students) {
          finalGrades.set(student.id, calculateFinalGradeCriterial(student.id, classData, criteria, repartoIgualCriterios, academicConfiguration.gradeScale));
      }
      return finalGrades;
  }, [classData, criteria, repartoIgualCriterios, academicConfiguration.gradeScale]);

  // Nota de comparación (motor tradicional por categorías, ej. "Exámenes
  // 40%..."): se mantiene como referencia, ya no es la oficial.
  const studentPeriodGrades = useMemo(() => {
    const periodGrades = new Map<string, Map<string, { grade: number | null; styleClasses: string }>>();
    for (const student of classData.students) {
        const studentGrades = new Map<string, { grade: number | null; styleClasses: string }>();
        evaluationPeriods.forEach(period => {
            studentGrades.set(period.id, calculateEvaluationPeriodGradeForStudent(student.id, classData, period.id, academicConfiguration.gradeScale));
        });
        periodGrades.set(student.id, studentGrades);
    }
    return periodGrades;
  }, [classData, evaluationPeriods, academicConfiguration.gradeScale]);

  const studentOverallFinalGrades = useMemo(() => {
      const finalGrades = new Map<string, { grade: string; styleClasses: string }>();
      for (const student of classData.students) {
          finalGrades.set(student.id, calculateOverallFinalGradeForStudent(student.id, classData, academicConfiguration));
      }
      return finalGrades;
  }, [classData, academicConfiguration]);

  const handleSaveAssignment = (assignmentData: Omit<Assignment, 'id' | 'categoryId'> & { id?: string; categoryId?: string }) => {
    if (!activeCategory) return;
    const assignment = { ...assignmentData, categoryId: assignmentData.categoryId ?? activeCategory.id };

    const existingIndex = classData.assignments.findIndex(a => a.id === assignment.id);
    let updatedAssignments;
    let updatedGrades = classData.grades;

    if (existingIndex > -1) {
      const previousAssignment = classData.assignments[existingIndex];
      updatedAssignments = classData.assignments.map(a => a.id === assignment.id ? { ...a, ...assignment } : a);

      // Si antes se calificaba con nota única (sin criterios) y ahora se le
      // han vinculado criterios, copia esa nota a cada criterio nuevo en vez
      // de perder lo ya calificado — se puede retocar a mano después.
      const teniaNotaUnica = previousAssignment.evaluationMethod === 'direct_grade' && (previousAssignment.linkedCriteria?.length || 0) === 0;
      const ahoraTieneCriterios = assignment.evaluationMethod === 'direct_grade' && (assignment.linkedCriteria?.length || 0) > 0;
      if (teniaNotaUnica && ahoraTieneCriterios) {
        updatedGrades = classData.grades.map(g => {
          if (g.assignmentId !== assignment.id) return g;
          const notaUnica = g.criterionScores?.['direct_score'];
          if (notaUnica == null) return g;
          const newCriterionScores = { ...g.criterionScores };
          assignment.linkedCriteria!.forEach(lc => {
            newCriterionScores[lc.criterionId] = notaUnica;
          });
          return { ...g, criterionScores: newCriterionScores };
        });
      }
    } else {
      updatedAssignments = [...classData.assignments, { ...assignment, id: `a-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` }];
    }
    onUpdateClass({ ...classData, assignments: updatedAssignments, grades: updatedGrades });
  };
  
  const handleSaveCategory = (category: Category) => {
      const existingIndex = classData.categories.findIndex(c => c.id === category.id);
      let updatedCategories;
      if (existingIndex > -1) {
          updatedCategories = classData.categories.map(c => c.id === category.id ? category : c);
      } else {
          updatedCategories = [...classData.categories, category];
      }
      onUpdateClass({ ...classData, categories: updatedCategories });
  };

  const handleEditAssignment = (assignment: Assignment) => {
    const category = classData.categories.find(c => c.id === assignment.categoryId);
    if(category){
        setActiveCategory(category);
        setAssignmentToEdit(assignment);
        setIsAssignmentModalOpen(true);
    }
  };

   const handleDeleteAssignment = (assignmentId: string) => {
    if(window.confirm("¿Seguro que quieres eliminar esta tarea y todas sus calificaciones?")) {
        const updatedAssignments = classData.assignments.filter(a => a.id !== assignmentId);
        const updatedGrades = classData.grades.filter(g => g.assignmentId !== assignmentId);
        onUpdateClass({ ...classData, assignments: updatedAssignments, grades: updatedGrades });
    }
  };

  const handleDeleteCategory = (categoryId: string) => {
    if(window.confirm("¿Seguro que quieres eliminar esta categoría y TODAS sus tareas y calificaciones?")) {
        const updatedCategories = classData.categories.filter(c => c.id !== categoryId);
        const assignmentsToDelete = classData.assignments.filter(a => a.categoryId === categoryId);
        const assignmentsToDeleteIds = new Set(assignmentsToDelete.map(a => a.id));
        const updatedAssignments = classData.assignments.filter(a => a.categoryId !== categoryId);
        const updatedGrades = classData.grades.filter(g => !assignmentsToDeleteIds.has(g.assignmentId));
        onUpdateClass({ ...classData, categories: updatedCategories, assignments: updatedAssignments, grades: updatedGrades });
    }
  };
  
  const handleOpenGradeEntry = (student: Student, assignment: Assignment) => {
    const grade = gradesMap.get(`${student.id}-${assignment.id}`) || null;
    setGradeEntryData({ student, assignment, grade });
    setIsGradeEntryModalOpen(true);
  };

  const handleSaveGrade = (studentId: string, assignmentId: string, data: { criterionScores: Record<string, number | null> } | { toolResults: Record<string, boolean | string> }, nextStudent: boolean = false) => {
    const assignment = classData.assignments.find(a => a.id === assignmentId);
    if (!assignment) return;

    let finalCriterionScores: Record<string, number | null>;
    const finalToolResults = 'toolResults' in data ? data.toolResults : undefined;

    if ('criterionScores' in data) {
        finalCriterionScores = data.criterionScores;
    } else {
        const tool = evaluationTools.find(t => t.id === assignment.evaluationToolId);
        if (!tool) {
            console.error("Evaluation tool not found for assignment");
            return;
        }
        finalCriterionScores = calculateCriterionScoresFromTool(tool, data.toolResults);
    }

    const existingGradeIndex = classData.grades.findIndex(
      (g) => g.studentId === studentId && g.assignmentId === assignmentId
    );

    let updatedGrades = [...classData.grades];
    
    const hasScores = Object.values(finalCriterionScores).some(s => s !== null);
    // Fix: Allow saving if there are tool results, even if score is null (e.g. unlinked tool)
    const hasToolResults = finalToolResults && Object.keys(finalToolResults).length > 0;

    const newGradeData: Grade = {
        studentId,
        assignmentId,
        criterionScores: finalCriterionScores,
        toolResults: finalToolResults,
    };

    if (existingGradeIndex > -1) {
        if (!hasScores && !hasToolResults) {
             // If no scores and no tool results, remove the grade entry entirely
             updatedGrades = updatedGrades.filter((_, index) => index !== existingGradeIndex);
        } else {
            updatedGrades[existingGradeIndex] = { ...updatedGrades[existingGradeIndex], ...newGradeData };
        }
    } else if (hasScores || hasToolResults) {
        updatedGrades.push(newGradeData);
    }

    // Update parent state
    onUpdateClass({ ...classData, grades: updatedGrades });

    if (nextStudent) {
        // Logic to switch to next student
        const currentStudentIndex = classData.students.findIndex(s => s.id === studentId);
        if (currentStudentIndex !== -1 && currentStudentIndex < classData.students.length - 1) {
            const nextStudent = classData.students[currentStudentIndex + 1];
            // Find grade in the UPDATED grades array (locally calculated since onUpdateClass is async-like in propagation)
            const nextGrade = updatedGrades.find(g => g.studentId === nextStudent.id && g.assignmentId === assignmentId) || null;
            setGradeEntryData({ student: nextStudent, assignment, grade: nextGrade });
        } else {
            setIsGradeEntryModalOpen(false);
        }
    } else {
        setIsGradeEntryModalOpen(false);
    }
  };

  const handleBulkSaveGrades = (gradesToSave: Map<string, number>) => {
    if (!assignmentForImport) return;

    const assignmentId = assignmentForImport.id;
    const linkedCriteriaIds = assignmentForImport.linkedCriteria.map(lc => lc.criterionId);
    const hasLinkedCriteria = linkedCriteriaIds.length > 0;

    const updatedGrades = [...classData.grades];

    gradesToSave.forEach((score, studentId) => {
        const criterionScores = hasLinkedCriteria
            ? Object.fromEntries(linkedCriteriaIds.map(id => [id, score]))
            : { 'manual_grade': score };
        
        const existingGradeIndex = updatedGrades.findIndex(g => g.studentId === studentId && g.assignmentId === assignmentId);

        if (existingGradeIndex > -1) {
            updatedGrades[existingGradeIndex] = { ...updatedGrades[existingGradeIndex], criterionScores };
        } else {
            updatedGrades.push({ studentId, assignmentId, criterionScores });
        }
    });

    onUpdateClass({ ...classData, grades: updatedGrades });
  };
  
  const handleReorderCategory = (catId: string, dir: -1 | 1) => {
    const cats = [...classData.categories];
    const periodCats = cats.filter(c => c.evaluationPeriodId === activePeriodId);
    const idx = periodCats.findIndex(c => c.id === catId);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= periodCats.length) return;
    const globalIdx = cats.indexOf(periodCats[idx]);
    const globalSwapIdx = cats.indexOf(periodCats[swapIdx]);
    [cats[globalIdx], cats[globalSwapIdx]] = [cats[globalSwapIdx], cats[globalIdx]];
    onUpdateClass({ ...classData, categories: cats });
  };

  const handleReorderAssignment = (assignId: string, dir: -1 | 1) => {
    const assigns = [...classData.assignments];
    const catId = assigns.find(a => a.id === assignId)?.categoryId;
    if (!catId) return;
    const catAssigns = assigns.filter(a => a.categoryId === catId && a.evaluationPeriodId === activePeriodId);
    const idx = catAssigns.findIndex(a => a.id === assignId);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= catAssigns.length) return;
    const globalIdx = assigns.indexOf(catAssigns[idx]);
    const globalSwapIdx = assigns.indexOf(catAssigns[swapIdx]);
    [assigns[globalIdx], assigns[globalSwapIdx]] = [assigns[globalSwapIdx], assigns[globalIdx]];
    onUpdateClass({ ...classData, assignments: assigns });
  };

  const categoriesForPeriod = useMemo(() => classData.categories.filter(c => c.evaluationPeriodId === activePeriodId), [classData.categories, activePeriodId]);
  const assignmentsForPeriod = useMemo(() => classData.assignments.filter(a => a.evaluationPeriodId === activePeriodId), [classData.assignments, activePeriodId]);

  const categoryColorMap = useMemo(() => {
    const COLORS = ['#0d9488','#ea580c','#7c3aed','#0284c7','#16a34a','#db2777','#ca8a04','#dc2626'];
    const map = new Map<string, string>();
    categoriesForPeriod.forEach((cat, idx) => map.set(cat.id, COLORS[idx % COLORS.length]));
    return map;
  }, [categoriesForPeriod]);

  const studentAssignmentScores = useMemo(() => {
    const allScores = new Map<string, Map<string, number | null>>();
    for (const student of classData.students) {
      allScores.set(student.id, calculateAssignmentScoresForStudent(student.id, assignmentsForPeriod, classData.grades));
    }
    return allScores;
  }, [classData.students, assignmentsForPeriod, classData.grades]);

  const sortedClassesForCopy = useMemo(() => {
      const sorted = [...allClasses];
      sorted.sort((a, b) => {
          // Current class first
          if (a.id === classData.id) return -1;
          if (b.id === classData.id) return 1;
          
          // Same course level second
          const aCourse = allCourses.find(c => c.id === a.courseId);
          const bCourse = allCourses.find(c => c.id === b.courseId);
          const currentCourse = allCourses.find(c => c.id === classData.courseId);
          
          const aSameCourse = aCourse && currentCourse && aCourse.level === currentCourse.level && aCourse.subject === currentCourse.subject;
          const bSameCourse = bCourse && currentCourse && bCourse.level === currentCourse.level && bCourse.subject === currentCourse.subject;

          if (aSameCourse && !bSameCourse) return -1;
          if (!aSameCourse && bSameCourse) return 1;

          return getClassName(a, allCourses).localeCompare(getClassName(b, allCourses));
      });
      return sorted;
  }, [allClasses, classData.id, classData.courseId, allCourses]);

  const periodsForSelectedSourceClass = useMemo(() => {
      const sourceClass = allClasses.find(c => c.id === selectedSourceClassId);
      if (!sourceClass) return [];

      return evaluationPeriods.filter(p => {
          // Check if this period has categories in the source class
          return sourceClass.categories.some(c => c.evaluationPeriodId === p.id);
      }).filter(p => {
          // Don't allow copying from self to self (same period)
          if (sourceClass.id === classData.id && p.id === activePeriodId) return false;
          return true;
      });
  }, [allClasses, selectedSourceClassId, evaluationPeriods, classData.id, activePeriodId]);
  
  const handleCopyCategories = (sourceClassId: string, sourcePeriodId: string) => {
      setIsCopyCatOpen(false);
      
      const sourceClass = allClasses.find(c => c.id === sourceClassId);
      const sourcePeriod = evaluationPeriods.find(p => p.id === sourcePeriodId);
      const activePeriod = evaluationPeriods.find(p => p.id === activePeriodId);
      
      if (!sourceClass || !sourcePeriod || !activePeriod) return;
  
      const message = sourceClass.id === classData.id
        ? `¿Seguro que quieres copiar todas las categorías de "${sourcePeriod.name}" a "${activePeriod.name}"?`
        : `¿Seguro que quieres copiar las categorías de "${getClassName(sourceClass, allCourses)} - ${sourcePeriod.name}" a tu clase actual?`;

      if (!window.confirm(message)) return;
  
      const sourceCategories = sourceClass.categories.filter(c => c.evaluationPeriodId === sourcePeriodId);
      const currentCategoryNames = new Set(categoriesForPeriod.map(c => c.name.toLowerCase()));
      const categoriesToCopy = sourceCategories.filter(sc => !currentCategoryNames.has(sc.name.toLowerCase()));
      
      if (categoriesToCopy.length !== sourceCategories.length) {
          alert("Algunas categorías no se copiaron porque ya existen nombres idénticos en este periodo.");
      }
      
      if (categoriesToCopy.length === 0) {
          if (sourceCategories.length > 0) return; 
          alert("No hay categorías para copiar en la evaluación seleccionada.");
          return;
      }
  
      const newCategories = categoriesToCopy.map(cat => ({
          ...cat,
          id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          evaluationPeriodId: activePeriodId,
      }));
  
      onUpdateClass({ ...classData, categories: [...classData.categories, ...newCategories] });
  };

  // Wrapper to inject the source assignment
  const handleCopyAssignmentModalSubmit = (targetClassId: string, targetPeriodId: string, targetCategoryId: string) => {
      if (assignmentToCopy) {
          onCopyAssignment(assignmentToCopy, targetClassId, targetPeriodId, targetCategoryId);
      }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm">
      {/* HEADER: Removed sticky here to allow scrolling if needed, minimizing overlap risk */}
      <div className={`flex flex-col md:flex-row justify-between items-start md:items-center rounded-t-xl p-4 sm:p-5 ${pageHeaderMinHeight} gap-3`} style={{ backgroundColor: getClassAccentColor(getMateria(classData, allCourses), classData.colorAcento).headerBg, ...headerPatternStyle }}>
        {/* LEFT: Título de la clase activa (el cambio de clase se hace desde el desplegable de la cabecera) */}
        <div className="flex items-center gap-3 min-w-0">
            <BookOpenIcon className="w-6 h-6 flex-shrink-0 text-white/90" />
            <ClassLabel classData={classData} courses={allCourses} className="text-lg font-bold text-white truncate" />
        </div>

        {/* RIGHT: Evaluation Period Tabs */}
        <div className="flex items-center space-x-1 p-1 overflow-x-auto no-scrollbar max-w-full">
          {evaluationPeriods.map(p => (
            <button
                key={p.id}
                onClick={() => setActivePeriodId(p.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-all ${
                    activePeriodId === p.id ? 'shadow-sm' : 'text-white/90 hover:bg-white/15'
                }`}
                style={activePeriodId === p.id ? { backgroundColor: SEMANTIC.primary.soft, color: SEMANTIC.primary.softText } : undefined}
            >
                {p.name}
            </button>
          ))}
          <button
            onClick={() => setActivePeriodId('final')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-all ${
                activePeriodId === 'final' ? 'shadow-sm' : 'text-white/90 hover:bg-white/15'
            }`}
            style={activePeriodId === 'final' ? { backgroundColor: SEMANTIC.warning.soft, color: SEMANTIC.warning.softText } : undefined}
          >
            Final
          </button>
          <button
            onClick={() => setDensity(d => d === 'compact' ? 'comfortable' : 'compact')}
            className="p-1.5 rounded-md text-white/90 hover:bg-white/15 transition-all flex-shrink-0"
            title={isCompact ? 'Vista cómoda' : 'Vista compacta'}
          >
            {isCompact ? <TableCellsIcon className="w-4 h-4" /> : <Bars3Icon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left">
          {/* Fix: Header set to sticky top-0 to stick to the very top of scroll view area */}
          <thead className="text-xs uppercase sticky top-0 z-20 shadow-sm">
            <tr>
              {/* Alumno Header Top Half: No bottom border, align bottom */}
              <th scope="col" className={`${studentHeaderPad} font-semibold sticky left-0 bg-white text-slate-700 z-30 w-52 text-center border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] ${activePeriodId !== 'final' ? 'border-b-0 align-bottom' : 'align-middle'}`}>
                  Alumn@
              </th>
              {activePeriodId === 'final' ? (
                <>
                  {evaluationPeriods.map(p => <th key={p.id} className={`${headerPad} font-semibold text-center bg-white text-slate-700 border-l border-slate-200`}>{p.name}</th>)}
                  <th className={`${headerPad} font-semibold text-center bg-white text-slate-700 border-l border-slate-200`}>Nota Final</th>
                </>
              ) : (
                <>
                  {categoriesForPeriod.map(cat => {
                    const assignmentsForCat = assignmentsForPeriod.filter(a => a.categoryId === cat.id);
                    return (
                      <th key={cat.id} colSpan={assignmentsForCat.length > 0 ? assignmentsForCat.length + 1 : 1} className={`${headerPad} font-semibold text-center border-l border-r-2 border-l-slate-200 border-r-slate-200 bg-white align-top`} style={{ color: categoryColorMap.get(cat.id), borderBottomColor: categoryColorMap.get(cat.id), borderBottomWidth: '3px' }}>
                        <div className="flex justify-center items-center">
                            {cat.name} ({cat.weight}%)
                            {cat.type === 'recovery' && <Badge variant="primary" className="ml-2" title="Categoría de Recuperación">REC</Badge>}
                        </div>
                        <div className="flex justify-center items-center gap-1 mt-1 font-normal normal-case">
                            <button onClick={() => { setActiveCategory(cat); setAssignmentToEdit(null); setIsAssignmentModalOpen(true); }} className="p-1 text-blue-600 hover:bg-blue-100 rounded-md text-xs">Añadir {cat.name.toLowerCase()}</button>
                            <IconButton label="Editar categoría" size="sm" onClick={() => {setCategoryToEdit(cat); setIsCategoryModalOpen(true);}}><PencilIcon className="w-3 h-3"/></IconButton>
                            <IconButton label="Eliminar categoría" tone="danger" size="sm" onClick={() => handleDeleteCategory(cat.id)}><TrashIcon className="w-3 h-3"/></IconButton>
                            <IconButton label="Mover izquierda" size="sm" onClick={() => handleReorderCategory(cat.id, -1)}><ArrowUpIcon className="w-3 h-3 -rotate-90"/></IconButton>
                            <IconButton label="Mover derecha" size="sm" onClick={() => handleReorderCategory(cat.id, 1)}><ArrowDownIcon className="w-3 h-3 -rotate-90"/></IconButton>
                        </div>
                      </th>
                    )
                  })}
                  <th rowSpan={2} className={`${headerPad} font-semibold text-center bg-white text-slate-700 border-l border-slate-200 align-middle relative`}>
                    Nota Ev.
                    <IconButton
                        label="Nueva categoría"
                        tone="success"
                        solid
                        size="sm"
                        onClick={() => { setCategoryToEdit(null); setIsCategoryModalOpen(true); }}
                        className="absolute top-1 right-1"
                    >
                        <PlusIcon className="w-4 h-4" />
                    </IconButton>
                  </th>
                </>
              )}
            </tr>
            {activePeriodId !== 'final' && (
              <tr>
                {/* Alumno Header Bottom Half: No top border, align top (visually merges with above) */}
                <th className={`${studentHeaderPad} sticky left-0 bg-white z-30 w-52 border-r border-t-0 border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]`}></th>
                
                {categoriesForPeriod.map(cat => {
                    const assignmentsForCat = assignmentsForPeriod.filter(a => a.categoryId === cat.id);
                    if (assignmentsForCat.length === 0) {
                        return <th key={`${cat.id}-empty`} className={`${cellPad} bg-white border-l border-r-2 border-slate-200`}></th>
                    }
                    return [
                        ...assignmentsForCat.map((a, idx) => (
                            <th key={a.id} className={`${cellPad} font-normal text-center border-l border-slate-200 ${idx === assignmentsForCat.length - 1 ? 'border-r border-r-slate-200' : ''} min-w-[120px] bg-white`} title={a.name} style={{ color: categoryColorMap.get(cat.id) }}>
                              <div className="truncate w-full mx-auto px-1">{a.name}</div>
                              <div className="flex justify-center items-center gap-1 mt-1">
                                <IconButton label="Editar tarea" size="sm" onClick={() => handleEditAssignment(a)}><PencilIcon className="w-3 h-3"/></IconButton>
                                <IconButton label="Eliminar tarea" tone="danger" size="sm" onClick={() => handleDeleteAssignment(a.id)}><TrashIcon className="w-3 h-3"/></IconButton>
                                <IconButton label="Copiar tarea a otra clase" tone="primary" size="sm" onClick={() => setAssignmentToCopy(a)}><DocumentDuplicateIcon className="w-3 h-3"/></IconButton>
                                <IconButton label="Importar notas en lote" tone="primary" size="sm" onClick={() => {setAssignmentForImport(a); setIsBulkImportModalOpen(true);}}><ArrowUpTrayIcon className="w-3 h-3"/></IconButton>
                                <IconButton label="Mover izquierda" size="sm" onClick={() => handleReorderAssignment(a.id, -1)}><ArrowUpIcon className="w-3 h-3 -rotate-90"/></IconButton>
                                <IconButton label="Mover derecha" size="sm" onClick={() => handleReorderAssignment(a.id, 1)}><ArrowDownIcon className="w-3 h-3 -rotate-90"/></IconButton>
                              </div>
                            </th>
                        )),
                        <th key={`${cat.id}-media`} className={`${cellPad} font-semibold text-center border-r-2 border-r-slate-300 min-w-[80px] bg-white`} style={{ color: categoryColorMap.get(cat.id) }}>
                            Media
                        </th>,
                    ];
                })}
              </tr>
            )}
          </thead>
          <tbody>
            {classData.students.map((student, index) => (
              <tr key={student.id} className="bg-white border-b hover:bg-slate-50/50">
                {/* Fix: Ensure student cell has z-10 to slide UNDER the sticky header (z-30) but over standard cells if scrolling horizontal */}
                <td className={`${studentCellPad} font-medium text-slate-900 sticky left-0 bg-white hover:bg-slate-50/50 z-10 w-52 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group`}>
                    <div className="flex items-center gap-1 w-full">
                        <span className="text-xs text-slate-400 w-5 text-right font-mono shrink-0 mr-1">{index + 1}</span>
                        <button 
                            onClick={() => setSelectedStudentForSummary(student)}
                            className={`flex items-center gap-2 text-left w-full transition-colors group-hover:underline truncate ${linkHoverClassName}`}
                        >
                            <AcneaeTag tags={student.acneae}/> 
                            <span className="truncate" title={student.name}>{student.name}</span>
                        </button>
                    </div>
                </td>
                {activePeriodId === 'final' ? (
                  <>
                    {evaluationPeriods.map(p => {
                       const oficial = studentPeriodGradesCriterial.get(student.id)?.get(p.id);
                       const comparacion = studentPeriodGrades.get(student.id)?.get(p.id);
                       return (
                         <td key={p.id} className={`${cellPad} text-center ${oficial?.styleClasses}`}>
                            <div className="font-bold text-base">{oficial?.grade?.toFixed(2) ?? '-'}</div>
                            <div className="text-[10px] text-slate-400 font-normal" title="Nota de comparación por categorías (tradicional)">cat: {comparacion?.grade?.toFixed(2) ?? '-'}</div>
                         </td>
                       );
                    })}
                    <td className={`${cellPad} text-center ${studentFinalGradesCriterial.get(student.id)?.styleClasses}`}>
                        <div className="font-extrabold text-lg">{studentFinalGradesCriterial.get(student.id)?.grade?.toFixed(2) ?? '-'}</div>
                        <div className="text-[10px] text-slate-400 font-normal" title="Nota de comparación por categorías (tradicional)">cat: {studentOverallFinalGrades.get(student.id)?.grade ?? '-'}</div>
                    </td>
                  </>
                ) : (
                  <>
                    {categoriesForPeriod.map(cat => {
                      const assignmentsForCat = assignmentsForPeriod.filter(a => a.categoryId === cat.id);
                       if (assignmentsForCat.length === 0) {
                          return <td key={`${cat.id}-empty-cell`} className={`${cellPad} border-l border-r-2 border-r-slate-400`}></td>
                      }
                      const categoryAverage = calculateCategoryAverageForStudent(student.id, classData, cat);
                      return [
                        ...assignmentsForCat.map((a, idx) => {
                            const score = studentAssignmentScores.get(student.id)?.get(a.id);
                            const styleClasses = getGradeStyleClasses(score ?? null, academicConfiguration);
                            return (
                              <td key={a.id} className={`${cellPad} text-center font-bold text-base cursor-pointer hover:bg-blue-50 border-l ${idx === assignmentsForCat.length - 1 ? 'border-r' : ''} ${styleClasses}`} onClick={() => handleOpenGradeEntry(student, a)}>
                                {score?.toFixed(2) ?? '-'}
                              </td>
                            )
                        }),
                        <td key={`${cat.id}-media`} className={`${cellPad} text-center font-semibold text-sm bg-slate-200 border-r-2 border-r-slate-400`}>
                            {categoryAverage?.toFixed(2) ?? '-'}
                        </td>,
                      ];
                    })}
                    <td className={`${cellPad} text-center border-l ${studentPeriodGradesCriterial.get(student.id)?.get(activePeriodId)?.styleClasses}`}>
                      <div className="font-bold text-base">{studentPeriodGradesCriterial.get(student.id)?.get(activePeriodId)?.grade?.toFixed(2) ?? '-'}</div>
                      <div className="text-[10px] text-slate-400 font-normal" title="Nota de comparación por categorías (tradicional)">cat: {studentPeriodGrades.get(student.id)?.get(activePeriodId)?.grade?.toFixed(2) ?? '-'}</div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
       {activePeriodId !== 'final' && (
          <div className="p-4 border-t flex justify-start items-center bg-slate-200 rounded-b-xl">
            <div className="relative" ref={copyCatRef}>
              <button 
                onClick={() => setIsCopyCatOpen(prev => !prev)} 
                disabled={evaluationPeriods.length <= 1 && allClasses.length <= 1} // Basic disable check, simplified
                className="text-xs font-semibold text-slate-600 hover:bg-slate-200 p-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                  Copiar categorías desde...
              </button>
              {isCopyCatOpen && (
                <div className="absolute bottom-full mb-2 w-80 bg-white shadow-lg border rounded-md p-2 z-20">
                    <div className="mb-2 pb-2 border-b">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Clase de origen:</label>
                        <Select
                            className="w-full text-sm"
                            value={selectedSourceClassId}
                            onChange={(e) => setSelectedSourceClassId(e.target.value)}
                        >
                            {sortedClassesForCopy.map(c => (
                                <option key={c.id} value={c.id}>{formatClassLabel(c, allCourses)}</option>
                            ))}
                        </Select>
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Periodo a copiar:</label>
                        {periodsForSelectedSourceClass.length > 0 ? (
                            periodsForSelectedSourceClass.map(p => (
                                <button 
                                    key={p.id} 
                                    onClick={() => handleCopyCategories(selectedSourceClassId, p.id)} 
                                    className="w-full text-left text-sm px-3 py-1.5 hover:bg-slate-100 rounded-md truncate"
                                >
                                    {p.name}
                                </button>
                            ))
                        ) : (
                            <p className="text-xs text-slate-400 italic px-2 py-1">No hay categorías disponibles en esta clase/periodo para copiar.</p>
                        )}
                    </div>
                </div>
              )}
            </div>
          </div>
       )}
      {activeCategory && <AssignmentModal isOpen={isAssignmentModalOpen} onClose={() => setIsAssignmentModalOpen(false)} onSave={handleSaveAssignment} assignmentToEdit={assignmentToEdit} category={activeCategory} criteria={criteria} specificCompetences={specificCompetences} keyCompetences={keyCompetences} programmingUnits={programmingUnits} evaluationPeriods={evaluationPeriods} academicConfiguration={academicConfiguration} evaluationTools={evaluationTools} allAssignments={classData.assignments} allCategories={classData.categories} />}
      <CategoryModal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} onSave={handleSaveCategory} categoryToEdit={categoryToEdit} evaluationPeriodId={activePeriodId} />
      {gradeEntryData && <GradeEntryModal isOpen={isGradeEntryModalOpen} onClose={() => setIsGradeEntryModalOpen(false)} student={gradeEntryData.student} assignment={gradeEntryData.assignment} grade={gradeEntryData.grade} criteriaList={criteria} onSave={handleSaveGrade} evaluationTools={evaluationTools} allAssignments={classData.assignments} students={classData.students} />}
      {assignmentForImport && <BulkGradeImportModal isOpen={isBulkImportModalOpen} onClose={() => setIsBulkImportModalOpen(false)} onSave={handleBulkSaveGrades} assignment={assignmentForImport} students={classData.students} />}
      {selectedStudentForSummary && (
          <StudentSummaryModal
            isOpen={!!selectedStudentForSummary}
            onClose={() => setSelectedStudentForSummary(null)}
            student={selectedStudentForSummary}
            classData={classData}
            courses={allCourses}
            academicConfiguration={academicConfiguration}
            criteria={criteria}
            specificCompetences={specificCompetences}
            keyCompetences={keyCompetences}
            repartoIgualCriterios={repartoIgualCriterios}
          />
      )}
      {assignmentToCopy && (
          <CopyAssignmentModal
            isOpen={!!assignmentToCopy}
            onClose={() => setAssignmentToCopy(null)}
            sourceAssignment={assignmentToCopy}
            allClasses={allClasses}
            courses={allCourses}
            currentClassId={classData.id}
            academicConfiguration={academicConfiguration}
            onCopy={handleCopyAssignmentModalSubmit}
          />
      )}
    </div>
  );
};

export default GradebookTable;

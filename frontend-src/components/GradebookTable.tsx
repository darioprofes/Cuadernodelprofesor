
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ClassData, Student, Assignment, Grade, EvaluationCriterion, Category, SpecificCompetence, KeyCompetence, ProgrammingUnit, AcademicConfiguration, EvaluationTool, Course } from '../types';
import { PlusIcon, PencilIcon, TrashIcon, BookOpenIcon, ArrowUpTrayIcon, DocumentDuplicateIcon, TableCellsIcon, Bars3Icon, MagnifyingGlassIcon } from './Icons';
import IconButton from './IconButton';
import Select from './Select';
import Input from './Input';
import Badge from './Badge';
import { linkHoverClassName } from '../theme/components/Link';
import { SEMANTIC } from '../theme/palette';
import { pageHeaderMinHeight } from '../theme/components/PageHeader';
import { headerPatternStyle } from '../theme/headerPattern';
import Modal from './Modal';
import Button from './Button';
import AssignmentModal from './AssignmentModal';
import GradeEntryModal from './GradeEntryModal';
import CategoryModal from './CategoryModal';
import AcneaeTag from './AcneaeTag';
import StudentAvatar from './StudentAvatar';
import ExistingStudentPicker from './ExistingStudentPicker';
import { calculateAssignmentScoresForStudent, calculateEvaluationPeriodGradeForStudent, calculateOverallFinalGradeForStudent, calculateCriterionScoresFromTool, getGradeColorClass, calculatePeriodGradeCriterial, calculateFinalGradeCriterial, calculateCategoryAverageForStudent } from '../services/gradeCalculations';
import BulkGradeImportModal from './BulkGradeImportModal';
import BulkAddStudentModal from './BulkAddStudentModal';
import StudentSummaryModal from './StudentSummaryModal';
import StudentPersonalDataModal from './StudentPersonalDataModal';
import PlanoClaseModal from './PlanoClaseModal';
import CopyAssignmentModal from './CopyAssignmentModal';
import ClassLabel from './ClassLabel';
import { formatClassLabel, getClassName, getMateria, getClassAccentColor, getNombreCompleto, getDayOfWeek1a7, parsePeriodRange } from '../utils';
import { useCreateCategory, useUpdateCategory, useDeleteCategory } from '../hooks/useCategories';
import { useCreateAssignment, useUpdateAssignment, useDeleteAssignment } from '../hooks/useAssignments';
import { usePutGrade, useDeleteGrade } from '../hooks/useGrades';
import { useApiStudents, useUpdateStudent } from '../hooks/useApiStudents';
import { useAbsences, usePutAbsence, useDeleteAbsence } from '../hooks/useAbsences';
import { useSincronizarEducastur } from '../hooks/useEducastur';
import type { TipoFalta, SincronizarEducasturResult } from '../types/api';
import { useCreateEnrollment, useUpdateEnrollment, useDeleteEnrollment } from '../hooks/useEnrollments';
import { useUpdateClass } from '../hooks/useApiClasses';
import { useCurrentAcademicYear } from '../hooks/useAcademicYears';
import { encodeGradeInput, splitStudentPatch, syncStudentPhoto } from '../services/apiAdapters';


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
  const { classData, allClasses, allCourses, criteria, specificCompetences, keyCompetences, programmingUnits, academicConfiguration, evaluationTools, onCopyAssignment } = props;
  const { evaluationPeriods } = academicConfiguration;
  const createCategoryMutation = useCreateCategory();
  const updateCategoryMutation = useUpdateCategory();
  const deleteCategoryMutation = useDeleteCategory();
  const createAssignmentMutation = useCreateAssignment();
  const updateAssignmentMutation = useUpdateAssignment();
  const deleteAssignmentMutation = useDeleteAssignment();
  const putGradeMutation = usePutGrade();
  const deleteGradeMutation = useDeleteGrade();

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

  // Panel de alumnado: avatar+ficha+plano+añadir/quitar directamente desde
  // el Cuaderno, sin pasar por la sección "Clases" (retirada, ver plan
  // cuaderno-panel-alumnado.md). Mismo patrón de menú contextual ya usado
  // antes en ClasesView.tsx.
  const queryClient = useQueryClient();
  const currentYear = useCurrentAcademicYear();
  const yearId = currentYear.data?.id ?? '';
  const remoteStudents = useApiStudents();
  const createEnrollmentMutation = useCreateEnrollment();
  const updateEnrollmentMutation = useUpdateEnrollment();
  const deleteEnrollmentMutation = useDeleteEnrollment();
  const updateStudentMutation = useUpdateStudent();
  const updateClassMutation = useUpdateClass();

  const [studentContextMenu, setStudentContextMenu] = useState<{ x: number; y: number; student: Student } | null>(null);
  const [fichaEditTarget, setFichaEditTarget] = useState<Student | null>(null);
  const [isPlanoOpen, setIsPlanoOpen] = useState(false);
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [drawnStudentIds, setDrawnStudentIds] = useState<Set<string>>(new Set());
  const [lastDrawnStudent, setLastDrawnStudent] = useState<Student | null>(null);

  useEffect(() => {
      if (!studentContextMenu) return;
      const close = () => setStudentContextMenu(null);
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
  }, [studentContextMenu]);

  // Reinicia el sorteo si cambia el alumnado (alta/baja) para no quedarse
  // con ids de alumnado que ya no está en la clase.
  useEffect(() => {
      setDrawnStudentIds(new Set());
      setLastDrawnStudent(null);
  }, [classData.id]);

  const openStudentContextMenu = (e: React.MouseEvent, student: Student) => {
      e.preventDefault();
      setStudentContextMenu({ x: e.clientX, y: e.clientY, student });
  };

  const visibleStudents = useMemo(() => {
      const q = studentSearch.trim().toLowerCase();
      if (!q) return classData.students;
      return classData.students.filter(s => getNombreCompleto(s).toLowerCase().includes(q));
  }, [classData.students, studentSearch]);

  const handleDeleteStudentFromClass = async (student: Student) => {
      if (!window.confirm(`¿Seguro que quieres eliminar a ${getNombreCompleto(student)} de esta clase? Se perderán todas sus calificaciones.`)) {
          return;
      }
      if (!student.enrollmentId) return;
      await deleteEnrollmentMutation.mutateAsync({ id: student.enrollmentId, classId: classData.id });
  };

  const handleSaveFichaEdit = async (studentId: string, data: Partial<Student>) => {
      const enrollment = classData.students.find(s => s.id === studentId);
      const { studentPatch, enrollmentPatch } = splitStudentPatch(data);
      if (Object.keys(studentPatch).length > 0) {
          await updateStudentMutation.mutateAsync({ id: studentId, data: studentPatch });
      }
      if (enrollment?.enrollmentId && Object.keys(enrollmentPatch).length > 0) {
          await updateEnrollmentMutation.mutateAsync({ id: enrollment.enrollmentId, classId: classData.id, data: enrollmentPatch });
      }
      if ('foto' in data) {
          await syncStudentPhoto(studentId, data.foto);
          queryClient.invalidateQueries({ queryKey: ['students'] });
      }
  };

  const handleEnrollExisting = async (studentId: string) => {
      await createEnrollmentMutation.mutateAsync({ classId: classData.id, data: { studentId } });
  };

  const handleBulkAddStudents = async (newStudentData: { nombre?: string; primerApellido?: string; segundoApellido?: string; acneae: string[] }[]) => {
      for (const data of newStudentData) {
          await createEnrollmentMutation.mutateAsync({
              classId: classData.id,
              data: { newStudent: { nombre: data.nombre, primerApellido: data.primerApellido, segundoApellido: data.segundoApellido }, acneae: data.acneae },
          });
      }
      setIsBulkAddOpen(false);
  };

  const handleUpdateMesaProfesor = async (x: number, y: number) => {
      await updateClassMutation.mutateAsync({ id: classData.id, yearId, data: { mesaProfesorX: x, mesaProfesorY: y } });
  };

  const handleUpdateStudentPosition = async (studentId: string, x: number, y: number) => {
      const student = classData.students.find(s => s.id === studentId);
      if (student?.enrollmentId) {
          await updateEnrollmentMutation.mutateAsync({ id: student.enrollmentId, classId: classData.id, data: { planoX: x, planoY: y } });
      }
  };

  // Selector aleatorio sin repetición ("dado"): baraja el alumnado de la
  // clase y va sacando uno a uno sin repetir hasta agotar el grupo, momento
  // en el que se vuelve a barajar solo — útil para preguntas al azar.
  const handleDrawStudent = () => {
      const pool = classData.students.filter(s => !drawnStudentIds.has(s.id));
      const source = pool.length > 0 ? pool : classData.students;
      const nextDrawnIds = pool.length > 0 ? drawnStudentIds : new Set<string>();
      if (source.length === 0) return;
      const picked = source[Math.floor(Math.random() * source.length)];
      setDrawnStudentIds(new Set(nextDrawnIds).add(picked.id));
      setLastDrawnStudent(picked);
  };

  const handleResetDraw = () => {
      setDrawnStudentIds(new Set());
      setLastDrawnStudent(null);
  };

  // Pestaña "Asistencia": faltas locales (tabla `absences`), independiente
  // de Educastur — ver plan integracion-educastur-faltas.md. La
  // sincronización real se añade en un bloque aparte (necesita credenciales
  // reales del profesor para probarse, no se puede verificar en local).
  const [gradebookTab, setGradebookTab] = useState<'calificaciones' | 'asistencia'>('calificaciones');
  const [extraAsistenciaDates, setExtraAsistenciaDates] = useState<string[]>([]);
  const [absenceContextMenu, setAbsenceContextMenu] = useState<{ x: number; y: number; enrollmentId: string; date: string; periodIndex: number } | null>(null);

  const absencesQuery = useAbsences(classData.id, { enabled: gradebookTab === 'asistencia' });
  const putAbsenceMutation = usePutAbsence();
  const deleteAbsenceMutation = useDeleteAbsence();

  useEffect(() => {
      if (!absenceContextMenu) return;
      const close = () => setAbsenceContextMenu(null);
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
  }, [absenceContextMenu]);

  const todayISO = useMemo(() => toYYYYMMDD(new Date()), []);

  // Mismo criterio que isHoliday en CalendarView.tsx: rangos [startDate,
  // endDate] de academicConfiguration.holidays.
  const isHolidayDate = (dateStr: string): boolean => {
      const d = new Date(`${dateStr}T00:00:00Z`);
      return (academicConfiguration.holidays || []).some(h => {
          if (!h.startDate || !h.endDate) return false;
          const start = new Date(h.startDate + 'T00:00:00Z');
          const end = new Date(h.endDate + 'T00:00:00Z');
          return d >= start && d <= end;
      });
  };

  // Resuelve TODAS las franjas horarias de esa clase para una fecha dada,
  // a partir de su horario semanal — un mismo alumno/clase puede tener dos
  // tramos distintos el mismo día (p.ej. una sesión doble no consecutiva),
  // y cada uno necesita poder marcarse y sincronizarse por separado. Un día
  // festivo (o findesemana, que ya no tiene ninguna franja en el horario)
  // no tiene ninguna franja marcable, ni aunque el horario dijera lo
  // contrario — no se pueden poner faltas en días no lectivos.
  const resolvePeriodIndicesForDate = (dateStr: string): number[] => {
      if (isHolidayDate(dateStr)) return [];
      const dow = getDayOfWeek1a7(new Date(`${dateStr}T00:00:00`));
      const slots = (classData.schedule || []).filter(s => s.day === dow);
      return Array.from(new Set(slots.map(s => s.periodIndex))).sort((a, b) => a - b);
  };

  const absenceMap = useMemo(() => {
      const map = new Map<string, import('../types/api').Absence>();
      (absencesQuery.data ?? []).forEach(a => map.set(`${a.enrollmentId}|${a.date}|${a.periodIndex}`, a));
      return map;
  }, [absencesQuery.data]);

  const asistenciaColumns = useMemo(() => {
      const historicDates = new Set<string>();
      (absencesQuery.data ?? []).forEach(a => { if (a.date !== todayISO) historicDates.add(a.date); });
      extraAsistenciaDates.forEach(d => { if (d !== todayISO) historicDates.add(d); });
      const sorted = Array.from(historicDates).sort((a, b) => b.localeCompare(a));
      return [todayISO, ...sorted];
  }, [absencesQuery.data, extraAsistenciaDates, todayISO]);

  const pendingSyncCount = (absencesQuery.data ?? []).filter(a => !a.syncedAt).length;

  // Aviso local, sin tocar Educastur: alumnado sin DNI o faltas en una
  // franja sin horas resolubles nunca se van a poder sincronizar, así que
  // se detecta y se enseña de antemano en vez de descubrirlo solo al
  // intentar sincronizar (lo de festivos no se puede adelantar así — hace
  // falta preguntarle a Educastur, ver el botón de sincronizar).
  const preflightIssues = useMemo(() => {
      const pending = (absencesQuery.data ?? []).filter(a => !a.syncedAt);
      const sinDni = new Set<string>();
      const sinFranja = new Set<string>();
      for (const a of pending) {
          const student = classData.students.find(s => s.enrollmentId === a.enrollmentId);
          const nombre = student ? getNombreCompleto(student) : 'Alumn@ desconocid@';
          if (!student?.dni) sinDni.add(nombre);
          const label = academicConfiguration.periods?.[a.periodIndex];
          if (!label || !parsePeriodRange(label)) sinFranja.add(nombre);
      }
      return { sinDni: Array.from(sinDni), sinFranja: Array.from(sinFranja) };
  }, [absencesQuery.data, classData.students, academicConfiguration.periods]);

  const handleAbsenceClick = (enrollmentId: string, date: string, periodIndex: number) => {
      putAbsenceMutation.mutate({ enrollmentId, classId: classData.id, data: { date, periodIndex, tipoFalta: 'I' } });
  };

  const openAbsenceContextMenu = (e: React.MouseEvent, enrollmentId: string, date: string, periodIndex: number) => {
      e.preventDefault();
      setAbsenceContextMenu({ x: e.clientX, y: e.clientY, enrollmentId, date, periodIndex });
  };

  const handleSetAbsenceType = (tipo: TipoFalta) => {
      if (!absenceContextMenu) return;
      const { enrollmentId, date, periodIndex } = absenceContextMenu;
      putAbsenceMutation.mutate({ enrollmentId, classId: classData.id, data: { date, periodIndex, tipoFalta: tipo } });
      setAbsenceContextMenu(null);
  };

  const handleClearAbsence = () => {
      if (!absenceContextMenu) return;
      const { enrollmentId, date, periodIndex } = absenceContextMenu;
      deleteAbsenceMutation.mutate({ enrollmentId, classId: classData.id, date, periodIndex });
      setAbsenceContextMenu(null);
  };

  const ABSENCE_COLORS: Record<TipoFalta, string> = {
      I: 'bg-red-100 text-red-700 border-red-300',
      J: 'bg-emerald-100 text-emerald-700 border-emerald-300',
      R: 'bg-amber-100 text-amber-700 border-amber-300',
  };
  const ABSENCE_LABELS: Record<TipoFalta, string> = { I: 'Injustificada', J: 'Justificada', R: 'Retraso' };

  // Sincronización con Educastur: login->push->logout autocontenido en una
  // sola llamada (POST /educastur/sincronizar), sin ningún vínculo
  // persistente — ver integracion-educastur-faltas.md. Usuario/contraseña
  // se escriben aquí mismo cada vez (autocomplete del navegador), nunca se
  // guardan en la app.
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncUsuario, setSyncUsuario] = useState('');
  const [syncContrasena, setSyncContrasena] = useState('');
  const [syncIdEmpleado, setSyncIdEmpleado] = useState('');
  const [syncIdCentro, setSyncIdCentro] = useState('');
  const [syncIdPerfil, setSyncIdPerfil] = useState('');
  const [syncResult, setSyncResult] = useState<SincronizarEducasturResult | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);

  const sincronizarMutation = useSincronizarEducastur();

  const handleSyncSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setSyncResult(null);
      setSyncErrorMsg(null);
      try {
          const result = await sincronizarMutation.mutateAsync({
              usuario: syncUsuario,
              contrasena: syncContrasena,
              idEmpleado: syncIdEmpleado ? Number(syncIdEmpleado) : undefined,
              idCentro: syncIdCentro ? Number(syncIdCentro) : undefined,
              idPerfil: syncIdPerfil ? Number(syncIdPerfil) : undefined,
          });
          setSyncResult(result);
          setSyncContrasena('');
          // El backend ya los recordó en educastur_config para la próxima
          // vez; rellenamos aquí también para no tener que reescribirlos si
          // se sincroniza otra vez sin recargar la página.
          if (result.idEmpleado) setSyncIdEmpleado(String(result.idEmpleado));
          if (result.idCentro) setSyncIdCentro(String(result.idCentro));
          if (result.idPerfil) setSyncIdPerfil(String(result.idPerfil));
      } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al sincronizar con Educastur.';
          setSyncErrorMsg(message);
      }
  };

  const handleCloseSyncModal = () => {
      setIsSyncModalOpen(false);
      setSyncContrasena('');
      setSyncResult(null);
      setSyncErrorMsg(null);
  };

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

  const handleSaveAssignment = async (assignmentData: Omit<Assignment, 'id' | 'categoryId'> & { id?: string; categoryId?: string }) => {
    if (!activeCategory) return;
    const assignment = { ...assignmentData, categoryId: assignmentData.categoryId ?? activeCategory.id };
    const existingIndex = classData.assignments.findIndex(a => a.id === assignment.id);

    const { id: _assignmentId, ...assignmentFields } = assignment;
    if (existingIndex > -1) {
      const previousAssignment = classData.assignments[existingIndex];
      await updateAssignmentMutation.mutateAsync({ id: assignment.id!, classId: classData.id, data: assignmentFields });

      // Misma migración "nota única -> criterios recién vinculados" que en
      // escritorio, pero como PUTs individuales (no hay guardado en bloque).
      const teniaNotaUnica = previousAssignment.evaluationMethod === 'direct_grade' && (previousAssignment.linkedCriteria?.length || 0) === 0;
      const ahoraTieneCriterios = assignment.evaluationMethod === 'direct_grade' && (assignment.linkedCriteria?.length || 0) > 0;
      if (teniaNotaUnica && ahoraTieneCriterios) {
        const gradesForAssignment = classData.grades.filter(g => g.assignmentId === assignment.id);
        for (const g of gradesForAssignment) {
          const notaUnica = g.criterionScores?.['direct_score'];
          if (notaUnica == null) continue;
          const student = classData.students.find(s => s.id === g.studentId);
          if (!student?.enrollmentId) continue;
          const newCriterionScores = { ...g.criterionScores };
          assignment.linkedCriteria!.forEach(lc => {
            newCriterionScores[lc.criterionId] = notaUnica;
          });
          await putGradeMutation.mutateAsync({
            assignmentId: assignment.id!,
            enrollmentId: student.enrollmentId,
            classId: classData.id,
            data: encodeGradeInput({ criterionScores: newCriterionScores }),
          });
        }
      }
    } else {
      await createAssignmentMutation.mutateAsync({ classId: classData.id, data: assignmentFields });
    }
  };

  const handleSaveCategory = async (category: Category) => {
      const existingIndex = classData.categories.findIndex(c => c.id === category.id);
      const data = { name: category.name, weight: category.weight, evaluationPeriodId: category.evaluationPeriodId, type: category.type };
      if (existingIndex > -1) {
          await updateCategoryMutation.mutateAsync({ id: category.id, classId: classData.id, data });
      } else {
          await createCategoryMutation.mutateAsync({ classId: classData.id, data });
      }
  };

  const handleEditAssignment = (assignment: Assignment) => {
    const category = classData.categories.find(c => c.id === assignment.categoryId);
    if(category){
        setActiveCategory(category);
        setAssignmentToEdit(assignment);
        setIsAssignmentModalOpen(true);
    }
  };

   const handleDeleteAssignment = async (assignmentId: string) => {
    if (!window.confirm("¿Seguro que quieres eliminar esta tarea y todas sus calificaciones?")) return;
    // assignment_id es ON DELETE CASCADE en grades — un único borrado basta.
    await deleteAssignmentMutation.mutateAsync({ id: assignmentId, classId: classData.id });
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!window.confirm("¿Seguro que quieres eliminar esta categoría y TODAS sus tareas y calificaciones?")) return;
    // category_id es ON DELETE CASCADE en assignments (y transitivamente en
    // grades) — un único borrado basta.
    await deleteCategoryMutation.mutateAsync({ id: categoryId, classId: classData.id });
  };
  
  const handleOpenGradeEntry = (student: Student, assignment: Assignment) => {
    const grade = gradesMap.get(`${student.id}-${assignment.id}`) || null;
    setGradeEntryData({ student, assignment, grade });
    setIsGradeEntryModalOpen(true);
  };

  const handleSaveGrade = async (studentId: string, assignmentId: string, data: { criterionScores: Record<string, number | null> } | { toolResults: Record<string, boolean | string> }, nextStudent: boolean = false) => {
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

    const hasScores = Object.values(finalCriterionScores).some(s => s !== null);
    // Fix: Allow saving if there are tool results, even if score is null (e.g. unlinked tool)
    const hasToolResults = finalToolResults && Object.keys(finalToolResults).length > 0;

    const student = classData.students.find(s => s.id === studentId);
    if (student?.enrollmentId) {
        if (!hasScores && !hasToolResults) {
            if (existingGradeIndex > -1) {
                await deleteGradeMutation.mutateAsync({ assignmentId, enrollmentId: student.enrollmentId, classId: classData.id });
            }
        } else {
            const encoded = 'toolResults' in data
                ? encodeGradeInput({ toolResults: data.toolResults, criterionScores: finalCriterionScores })
                : encodeGradeInput({ criterionScores: finalCriterionScores });
            await putGradeMutation.mutateAsync({ assignmentId, enrollmentId: student.enrollmentId, classId: classData.id, data: encoded });
        }
    }

    if (nextStudent) {
        // Logic to switch to next student
        const currentStudentIndex = classData.students.findIndex(s => s.id === studentId);
        if (currentStudentIndex !== -1 && currentStudentIndex < classData.students.length - 1) {
            const nextStudentObj = classData.students[currentStudentIndex + 1];
            const nextGrade = classData.grades.find(g => g.studentId === nextStudentObj.id && g.assignmentId === assignmentId) || null;
            setGradeEntryData({ student: nextStudentObj, assignment, grade: nextGrade });
        } else {
            setIsGradeEntryModalOpen(false);
        }
    } else {
        setIsGradeEntryModalOpen(false);
    }
  };

  const handleBulkSaveGrades = async (gradesToSave: Map<string, number>) => {
    if (!assignmentForImport) return;

    const assignmentId = assignmentForImport.id;
    const linkedCriteriaIds = assignmentForImport.linkedCriteria.map(lc => lc.criterionId);
    const hasLinkedCriteria = linkedCriteriaIds.length > 0;

    for (const [studentId, score] of gradesToSave) {
        const student = classData.students.find(s => s.id === studentId);
        if (!student?.enrollmentId) continue;
        const criterionScores = hasLinkedCriteria
            ? Object.fromEntries(linkedCriteriaIds.map(id => [id, score]))
            : { 'manual_grade': score };
        await putGradeMutation.mutateAsync({
            assignmentId,
            enrollmentId: student.enrollmentId,
            classId: classData.id,
            data: encodeGradeInput({ criterionScores }),
        });
    }
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
  
  const handleCopyCategories = async (sourceClassId: string, sourcePeriodId: string) => {
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

      for (const cat of categoriesToCopy) {
          await createCategoryMutation.mutateAsync({
              classId: classData.id,
              data: { name: cat.name, weight: cat.weight, evaluationPeriodId: activePeriodId, type: cat.type },
          });
      }
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
            <button
                onClick={() => setIsPlanoOpen(true)}
                className="p-1.5 rounded-md text-white/90 hover:bg-white/15 transition-all flex-shrink-0"
                title="Plano de la clase"
            >
                <span className="text-base leading-none">🪑</span>
            </button>
            <div className="flex items-center gap-1 flex-shrink-0">
                <button
                    onClick={handleDrawStudent}
                    disabled={classData.students.length === 0}
                    className="p-1.5 rounded-md text-white/90 hover:bg-white/15 transition-all disabled:opacity-40"
                    title="Sortear alumn@ al azar, sin repetir hasta agotar la clase"
                >
                    <span className="text-base leading-none">🎲</span>
                </button>
                {lastDrawnStudent && (
                    <span className="text-xs font-semibold text-white bg-white/15 rounded-full px-2 py-1 flex items-center gap-1.5 whitespace-nowrap">
                        {getNombreCompleto(lastDrawnStudent)}
                        <span className="text-white/70 font-normal">({drawnStudentIds.size}/{classData.students.length})</span>
                        <button onClick={handleResetDraw} title="Reiniciar sorteo" className="hover:text-white/70">↺</button>
                    </span>
                )}
            </div>
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

      <div className="flex items-center gap-1 px-4 sm:px-5 pt-3 border-b border-slate-200">
          <button
              onClick={() => setGradebookTab('calificaciones')}
              className={`px-3 py-1.5 text-sm font-semibold rounded-t-md ${gradebookTab === 'calificaciones' ? 'text-slate-800 border-b-2 border-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
          >
              Calificaciones
          </button>
          <button
              onClick={() => setGradebookTab('asistencia')}
              className={`px-3 py-1.5 text-sm font-semibold rounded-t-md ${gradebookTab === 'asistencia' ? 'text-slate-800 border-b-2 border-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
          >
              Asistencia
          </button>
      </div>

      {gradebookTab === 'calificaciones' && (
      <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left">
          {/* Fix: Header set to sticky top-0 to stick to the very top of scroll view area */}
          <thead className="text-xs uppercase sticky top-0 z-20 shadow-sm">
            <tr>
              {/* Alumno Header Top Half: No bottom border, align bottom */}
              <th scope="col" className={`${studentHeaderPad} font-semibold sticky left-0 bg-white text-slate-700 z-30 w-52 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] ${activePeriodId !== 'final' ? 'border-b-0 align-bottom' : 'align-middle'}`}>
                  {classData.students.length > 6 ? (
                      <div className="flex items-center gap-1 normal-case font-normal">
                          <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <input
                              type="text"
                              value={studentSearch}
                              onChange={e => setStudentSearch(e.target.value)}
                              placeholder="Buscar…"
                              className="w-full text-xs border-none focus:ring-0 p-0 bg-transparent"
                          />
                      </div>
                  ) : (
                      <div className="flex items-center justify-between gap-1">
                          <span>Alumn@</span>
                      </div>
                  )}
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
            {visibleStudents.map((student, index) => (
              <tr key={student.id} className="bg-white border-b hover:bg-slate-50/50">
                {/* Fix: Ensure student cell has z-10 to slide UNDER the sticky header (z-30) but over standard cells if scrolling horizontal */}
                <td
                    className={`${studentCellPad} font-medium text-slate-900 sticky left-0 bg-white hover:bg-slate-50/50 z-10 w-52 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group`}
                    onContextMenu={e => openStudentContextMenu(e, student)}
                >
                    <div className="flex items-center gap-1 w-full">
                        <span className="text-xs text-slate-400 w-5 text-right font-mono shrink-0 mr-1">{index + 1}</span>
                        <button
                            onClick={() => setSelectedStudentForSummary(student)}
                            className={`flex items-center gap-2 text-left w-full transition-colors group-hover:underline truncate ${linkHoverClassName}`}
                        >
                            <StudentAvatar student={student} bgColor={getClassAccentColor(getMateria(classData, allCourses), classData.colorAcento).headerBg} />
                            <AcneaeTag tags={student.acneae}/>
                            <span className="truncate" title={getNombreCompleto(student)}>{getNombreCompleto(student)}</span>
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
      <div className="p-3 border-t bg-slate-50/50 space-y-2">
          <button onClick={() => setIsBulkAddOpen(true)} className="w-full text-center py-2 text-sm font-semibold text-green-600 hover:bg-green-100 bg-white rounded-md border border-slate-200 shadow-sm">
              + Añadir alumn@
          </button>
          <ExistingStudentPicker
              allStudents={remoteStudents.data ?? []}
              alreadyEnrolledIds={new Set(classData.students.map(s => s.id))}
              onEnroll={handleEnrollExisting}
          />
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
      </>
      )}

      {gradebookTab === 'asistencia' && (
      <div>
        {(preflightIssues.sinDni.length > 0 || preflightIssues.sinFranja.length > 0) && (
            <div className="p-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 space-y-1">
                <p className="font-semibold">Estas faltas no se van a poder subir a Educastur — revísalas:</p>
                {preflightIssues.sinDni.length > 0 && (
                    <p>Sin DNI/NIE registrado en la ficha: {preflightIssues.sinDni.join(', ')}.</p>
                )}
                {preflightIssues.sinFranja.length > 0 && (
                    <p>En una franja horaria sin horas (p. ej. "Recreo") — Educastur necesita un tramo con hora real: {preflightIssues.sinFranja.join(', ')}.</p>
                )}
            </div>
        )}
        <div className="p-3 border-b bg-slate-50/50 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-slate-600">
                <span>Añadir un día concreto:</span>
                <input
                    type="date"
                    onChange={e => {
                        const picked = e.target.value;
                        if (picked) {
                            setExtraAsistenciaDates(prev => Array.from(new Set([...prev, picked])));
                            e.target.value = '';
                        }
                    }}
                    className="border border-slate-300 rounded-md text-sm px-2 py-1"
                />
            </div>
            <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{pendingSyncCount} falta(s) sin subir a Educastur</span>
                <button
                    onClick={() => setIsSyncModalOpen(true)}
                    className="text-xs font-semibold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md border border-blue-200"
                >
                    Subir a Educastur
                </button>
            </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="text-xs uppercase sticky top-0 z-20 shadow-sm bg-white">
              <tr>
                <th className={`${studentHeaderPad} font-semibold sticky left-0 bg-white text-slate-700 z-30 w-52 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]`}>Alumn@</th>
                {asistenciaColumns.map(date => (
                  <th key={date} className={`${headerPad} font-semibold text-center bg-white text-slate-700 border-l border-slate-200 min-w-[90px] ${date === todayISO ? 'bg-blue-50' : ''}`}>
                      {date === todayISO ? 'Hoy' : date.split('-').reverse().join('/')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleStudents.map((student, index) => (
                <tr key={student.id} className="bg-white border-b hover:bg-slate-50/50">
                  <td className={`${studentCellPad} font-medium text-slate-900 sticky left-0 bg-white hover:bg-slate-50/50 z-10 w-52 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>
                      <div className="flex items-center gap-1 w-full">
                          <span className="text-xs text-slate-400 w-5 text-right font-mono shrink-0 mr-1">{index + 1}</span>
                          <StudentAvatar student={student} bgColor={getClassAccentColor(getMateria(classData, allCourses), classData.colorAcento).headerBg} />
                          <span className="truncate" title={getNombreCompleto(student)}>{getNombreCompleto(student)}</span>
                      </div>
                  </td>
                  {asistenciaColumns.map(date => {
                      // Normalmente una sola franja, pero una clase puede
                      // tener dos tramos el mismo día — cada uno se marca y
                      // sincroniza por separado, así que la celda muestra un
                      // círculo por tramo, no uno solo por fecha.
                      const periodIndices = resolvePeriodIndicesForDate(date);
                      return (
                          <td key={date} className={`${cellPad} text-center border-l border-slate-200 ${periodIndices.length === 0 ? 'bg-slate-50' : ''}`}>
                              {periodIndices.length === 0 ? (
                                  <span className="text-slate-300 text-xs">—</span>
                              ) : (
                                  <div className="flex items-center justify-center gap-1">
                                      {periodIndices.map(periodIndex => {
                                          const absence = student.enrollmentId
                                              ? absenceMap.get(`${student.enrollmentId}|${date}|${periodIndex}`)
                                              : undefined;
                                          const label = academicConfiguration.periods?.[periodIndex] ?? `Franja ${periodIndex + 1}`;
                                          return (
                                              <span
                                                  key={periodIndex}
                                                  className={`inline-flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-bold cursor-pointer transition-colors ${absence ? `${ABSENCE_COLORS[absence.tipoFalta]} hover:opacity-80` : 'border-slate-300 bg-white text-slate-300 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-500'}`}
                                                  title={absence ? `${ABSENCE_LABELS[absence.tipoFalta]} — ${label}` : `Marcar falta — ${label}`}
                                                  onClick={() => student.enrollmentId && handleAbsenceClick(student.enrollmentId, date, periodIndex)}
                                                  onContextMenu={e => student.enrollmentId && openAbsenceContextMenu(e, student.enrollmentId, date, periodIndex)}
                                              >
                                                  {absence ? absence.tipoFalta : '+'}
                                              </span>
                                          );
                                      })}
                                  </div>
                              )}
                          </td>
                      );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {absenceContextMenu && (
          <>
              <div className="fixed inset-0 z-40" onMouseDown={() => setAbsenceContextMenu(null)} />
              <div
                  style={{ position: 'fixed', top: absenceContextMenu.y, left: absenceContextMenu.x, zIndex: 50 }}
                  className="bg-white border border-slate-200 rounded-lg shadow-xl py-1 min-w-[160px] text-sm"
              >
                  <button className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-700" onMouseDown={() => handleSetAbsenceType('I')}>Injustificada</button>
                  <button className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-emerald-700" onMouseDown={() => handleSetAbsenceType('J')}>Justificada</button>
                  <button className="w-full text-left px-3 py-2 hover:bg-amber-50 text-amber-700" onMouseDown={() => handleSetAbsenceType('R')}>Retraso</button>
                  <button className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-600 border-t border-slate-100" onMouseDown={handleClearAbsence}>Quitar marca</button>
              </div>
          </>
      )}

      {activeCategory && <AssignmentModal isOpen={isAssignmentModalOpen} onClose={() => setIsAssignmentModalOpen(false)} onSave={handleSaveAssignment} assignmentToEdit={assignmentToEdit} category={activeCategory} criteria={criteria} specificCompetences={specificCompetences} keyCompetences={keyCompetences} programmingUnits={programmingUnits} evaluationPeriods={evaluationPeriods} academicConfiguration={academicConfiguration} evaluationTools={evaluationTools} allAssignments={classData.assignments} allCategories={classData.categories} />}
      <CategoryModal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} onSave={handleSaveCategory} categoryToEdit={categoryToEdit} evaluationPeriodId={activePeriodId} />
      {gradeEntryData && <GradeEntryModal isOpen={isGradeEntryModalOpen} onClose={() => setIsGradeEntryModalOpen(false)} student={gradeEntryData.student} assignment={gradeEntryData.assignment} grade={gradeEntryData.grade} criteriaList={criteria} onSave={handleSaveGrade} evaluationTools={evaluationTools} allAssignments={classData.assignments} students={classData.students} />}
      {assignmentForImport && <BulkGradeImportModal isOpen={isBulkImportModalOpen} onClose={() => setIsBulkImportModalOpen(false)} onSave={handleBulkSaveGrades} assignment={assignmentForImport} students={classData.students} />}
      <BulkAddStudentModal isOpen={isBulkAddOpen} onClose={() => setIsBulkAddOpen(false)} onSave={handleBulkAddStudents} />
      <StudentPersonalDataModal
          isOpen={!!fichaEditTarget}
          onClose={() => setFichaEditTarget(null)}
          student={fichaEditTarget}
          onSave={handleSaveFichaEdit}
      />
      {isPlanoOpen && (
          <PlanoClaseModal
              isOpen={isPlanoOpen}
              onClose={() => setIsPlanoOpen(false)}
              classData={classData}
              materia={getMateria(classData, allCourses)}
              onUpdateMesaProfesor={handleUpdateMesaProfesor}
              onUpdateStudentPosition={handleUpdateStudentPosition}
              onOpenFicha={setSelectedStudentForSummary}
          />
      )}
      {studentContextMenu && (
          <>
              <div className="fixed inset-0 z-40" onMouseDown={() => setStudentContextMenu(null)} />
              <div
                  style={{ position: 'fixed', top: studentContextMenu.y, left: studentContextMenu.x, zIndex: 50 }}
                  className="bg-white border border-slate-200 rounded-lg shadow-xl py-1 min-w-[180px] text-sm"
              >
                  <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 border-b border-slate-100 truncate">
                      {getNombreCompleto(studentContextMenu.student)}
                  </div>
                  <button
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700"
                      onMouseDown={() => { setSelectedStudentForSummary(studentContextMenu.student); setStudentContextMenu(null); }}
                  >
                      Ver ficha
                  </button>
                  <button
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700"
                      onMouseDown={() => { setFichaEditTarget(studentContextMenu.student); setStudentContextMenu(null); }}
                  >
                      Editar ficha
                  </button>
                  <button
                      className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600"
                      onMouseDown={() => { handleDeleteStudentFromClass(studentContextMenu.student); setStudentContextMenu(null); }}
                  >
                      Eliminar de esta clase
                  </button>
              </div>
          </>
      )}
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
      <Modal isOpen={isSyncModalOpen} onClose={handleCloseSyncModal} title="Subir a Educastur" size="md">
          {syncResult ? (
              <div className="space-y-3">
                  <p className="text-sm text-emerald-700 font-semibold">
                      {syncResult.sincronizadas} falta(s) subida(s) correctamente
                      {syncResult.nombreProfesor ? ` — ${syncResult.nombreProfesor}` : ''}.
                  </p>
                  {syncResult.errores.length > 0 && (
                      <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="font-semibold mb-1">{syncResult.errores.length} error(es):</p>
                          <ul className="list-disc list-inside space-y-0.5">
                              {syncResult.errores.map((e, i) => <li key={i}>{e.alumno}: {e.motivo}</li>)}
                          </ul>
                      </div>
                  )}
                  <div className="flex justify-end pt-2">
                      <Button type="button" variant="secondary" onClick={handleCloseSyncModal}>Cerrar</Button>
                  </div>
              </div>
          ) : (
              <form onSubmit={handleSyncSubmit} className="space-y-4" autoComplete="on">
                  <p className="text-xs text-slate-500">
                      Se conecta a Educastur solo mientras dura esta subida — usuario y contraseña no se guardan en ningún sitio, se piden aquí cada vez.
                  </p>
                  <div>
                      <label className="block text-sm font-medium text-slate-700">Usuario de Educastur</label>
                      <Input type="text" autoComplete="username" required value={syncUsuario} onChange={e => setSyncUsuario(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-slate-700">Contraseña</label>
                      <Input type="password" autoComplete="current-password" required value={syncContrasena} onChange={e => setSyncContrasena(e.target.value)} className="mt-1" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <p className="col-span-3 text-xs text-slate-500 -mt-1 mb-1">
                          Se resuelven solos al subir — solo hace falta rellenarlos a mano si por lo que sea no se pudieran determinar automáticamente.
                      </p>
                      <div>
                          <label className="block text-xs font-medium text-slate-600">Id empleado</label>
                          <Input type="number" value={syncIdEmpleado} onChange={e => setSyncIdEmpleado(e.target.value)} className="mt-1" />
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-slate-600">Id centro</label>
                          <Input type="number" value={syncIdCentro} onChange={e => setSyncIdCentro(e.target.value)} className="mt-1" />
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-slate-600">Id perfil</label>
                          <Input type="number" placeholder="2" value={syncIdPerfil} onChange={e => setSyncIdPerfil(e.target.value)} className="mt-1" />
                      </div>
                  </div>
                  {syncErrorMsg && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{syncErrorMsg}</p>}
                  <div className="flex justify-end gap-2 pt-2">
                      <Button type="button" variant="secondary" onClick={handleCloseSyncModal}>Cancelar</Button>
                      <Button type="submit" variant="primary" disabled={sincronizarMutation.isPending}>
                          {sincronizarMutation.isPending ? 'Subiendo…' : 'Subir'}
                      </Button>
                  </div>
              </form>
          )}
      </Modal>
    </div>
  );
};

export default GradebookTable;

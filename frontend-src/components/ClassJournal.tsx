
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { JournalEntry, ClassData, AcademicConfiguration, ProgrammingUnit, Course } from '../types';
import { ClockIcon, BookOpenIcon, ClipboardDocumentIcon, ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassIcon, CheckCircleIcon } from './Icons';
import ClassLabel from './ClassLabel';
import Input from './Input';
import Textarea from './Textarea';
import EmptyState from './EmptyState';
import IconButton from './IconButton';
import DateNavButton from './DateNavButton';
import { PALETTE } from '../theme/palette';
import { pageHeaderMinHeight, pageHeaderPaddingClassName } from '../theme/components/PageHeader';
import { headerPatternStyle } from '../theme/headerPattern';
import { getMateria, getClassAccentColor, formatFechaEs } from '../utils';

type PlannedContent = { unitName: string, sessionDesc: string, sessionNumber: number } | null;

interface ClassJournalProps {
  classes: ClassData[];
  entries: JournalEntry[];
  onSave: (entry: JournalEntry) => void;
  academicConfiguration: AcademicConfiguration;
  units: ProgrammingUnit[];
  courses: Course[];
  onDirtyChange?: (dirty: boolean) => void;
}

const toYYYYMMDD = (date: Date): string => {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const addDays = (date: Date, days: number): Date => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};

// Clave de notesMap/isDirtyMap: por (clase, franja), no solo por clase — una
// clase con varias sesiones el mismo día tiene una anotación por sesión.
const entryKey = (classId: string, periodIndex: number): string => `${classId}::${periodIndex}`;

const ClassJournal: React.FC<ClassJournalProps> = ({ classes, entries, onSave, academicConfiguration, units, courses, onDirtyChange }) => {
  const [selectedDate, setSelectedDate] = useState<string>(toYYYYMMDD(new Date()));
  // Local state to hold edits before saving: Map<classId, string>
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [isDirtyMap, setIsDirtyMap] = useState<Record<string, boolean>>({});
  const isDirty = Object.values(isDirtyMap).some(Boolean);

  // Búsqueda de anotaciones pasadas: el Diario solo muestra un día a la
  // vez, así que sin esto no había forma de encontrar "qué anoté sobre X"
  // salvo ir pinchando día a día. Busca en el texto de la anotación y en
  // la materia/clase; al elegir un resultado salta a ese día.
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Avisa a App.tsx (para bloquear el cambio de vista) y al propio
  // navegador (cierre/recarga de pestaña) mientras haya anotaciones sin
  // guardar: es fácil escribir la nota y olvidarse de pulsar "Guardar".
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);

  // Determine day of week for schedule filtering (1=Mon, 5=Fri)
  const dayOfWeek = useMemo(() => {
      const d = new Date(selectedDate);
      const day = d.getDay();
      return day === 0 ? 7 : day; // Normalize Sunday if needed, though schedule is usually 1-5
  }, [selectedDate]);

  // Helper to check for holidays
  const isHoliday = useMemo(() => {
        if (!academicConfiguration || !Array.isArray(academicConfiguration.holidays)) {
            return () => false;
        }
        const holidayRanges = academicConfiguration.holidays
            .filter(h => h.startDate && h.endDate)
            .map(h => ({
                start: new Date(h.startDate + 'T00:00:00'),
                end: new Date(h.endDate + 'T00:00:00')
            }));
        
        return (date: Date): boolean => {
            const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            return holidayRanges.some(range => dateOnly >= range.start && dateOnly <= range.end);
        };
        // Narrowed on purpose to .holidays: nothing else in academicConfiguration
        // affects this calculation, and depending on the whole object would
        // rebuild isHoliday (and everything downstream) on every unrelated
        // settings change (grading periods, gradeScale, etc).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [academicConfiguration.holidays]);

  // Logic to find planned content for a specific class and date. Wrapped in
  // useCallback (rather than a plain function) so its identity only changes
  // when an input that actually affects the result changes — otherwise
  // scheduledClasses below couldn't safely list it as a dependency.
  const getPlannedContent = React.useCallback((classData: ClassData, targetDateStr: string): PlannedContent => {
        if (!classData.schedule || classData.schedule.length === 0) return null;
        if (!academicConfiguration.academicYearStart || !academicConfiguration.academicYearEnd) return null;

        const courseUnits = units.filter(u => u.courseId === classData.courseId);
        if (courseUnits.length === 0) return null;

        const skippedDaysSet = new Set(classData.skippedDays || []);
        const targetDate = new Date(targetDateStr + 'T00:00:00');
        const startDate = new Date(academicConfiguration.academicYearStart + 'T00:00:00');
        
        // Check if today is valid for this class
        const slotsToday = classData.schedule.filter(s => s.day === targetDate.getDay());
        if (slotsToday.length === 0 || skippedDaysSet.has(targetDateStr) || isHoliday(targetDate)) {
            return null;
        }

        // Calculate total sessions passed before today to find the index
        let sessionsPassed = 0;
        let currentDateIterator = new Date(startDate);
        
        while (currentDateIterator < targetDate) {
            const dStr = toYYYYMMDD(currentDateIterator);
            const dayIdx = currentDateIterator.getDay();
            
            if (dayIdx !== 0 && dayIdx !== 6 && !isHoliday(currentDateIterator) && !skippedDaysSet.has(dStr)) {
                const slots = classData.schedule.filter(s => s.day === dayIdx);
                sessionsPassed += slots.length;
            }
            currentDateIterator = addDays(currentDateIterator, 1);
        }

        // The current session index starts at sessionsPassed. 
        // If there are multiple slots today, we might need to handle them. 
        // For simplicity in the Journal view, we'll just take the FIRST slot's content or join them if multiple.
        // Assuming 1 unit flow per course.
        
        let cumulativeSessions = 0;
        for (const unit of courseUnits) {
            // Check if this unit covers our session index
            if (sessionsPassed < cumulativeSessions + unit.sessions) {
                const sessionInUnit = sessionsPassed - cumulativeSessions;
                const detail = unit.sessionDetails?.[sessionInUnit];
                return {
                    unitName: unit.name,
                    sessionDesc: detail?.description || '',
                    sessionNumber: sessionInUnit + 1
                };
            }
            cumulativeSessions += unit.sessions;
        }

        return null;
  }, [academicConfiguration.academicYearStart, academicConfiguration.academicYearEnd, units, isHoliday]);

  // Una tarjeta por (clase, franja): una clase con varias sesiones el mismo
  // día (p.ej. "RECREO", con el hueco de las 11:00 y el de las 13:20) tiene
  // una anotación independiente por franja, no una compartida para todo el
  // día — JournalEntry incluye periodIndex justo para esto.
  const scheduledClasses = useMemo(() => {
      const list: { classData: ClassData, periodIndex: number, periodName: string, plannedContent: PlannedContent }[] = [];

      classes.forEach(c => {
          const slots = c.schedule?.filter(s => s.day === dayOfWeek);
          if (slots && slots.length > 0) {
              const planned = getPlannedContent(c, selectedDate);
              slots.forEach(slot => {
                  list.push({
                      classData: c,
                      periodIndex: slot.periodIndex,
                      periodName: academicConfiguration.periods?.[slot.periodIndex] || `Hora ${slot.periodIndex + 1}`,
                      plannedContent: planned,
                  });
              });
          }
      });

      return list.sort((a, b) => a.periodIndex - b.periodIndex);
  }, [classes, dayOfWeek, academicConfiguration.periods, selectedDate, getPlannedContent]);

  const searchResults = useMemo(() => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return [];

      return entries
          .filter(e => e.notes && e.notes.trim() !== '')
          .map(e => {
              const classData = classes.find(c => c.id === e.classId);
              if (!classData) return null;
              const materia = getMateria(classData, courses);
              const haystack = `${e.notes} ${materia}`.toLowerCase();
              if (!haystack.includes(query)) return null;
              return { entry: e, classData, materia };
          })
          .filter((r): r is { entry: JournalEntry; classData: ClassData; materia: string } => r !== null)
          .sort((a, b) => b.entry.date.localeCompare(a.entry.date))
          .slice(0, 15);
  }, [entries, searchQuery, classes, courses]);

  const handleSelectSearchResult = (date: string) => {
      setSearchQuery('');
      setIsSearchOpen(false);
      changeDate(date);
  };

  // Initialize notes from existing entries when date changes
  useEffect(() => {
      const newNotes: Record<string, string> = {};
      const newDirty: Record<string, boolean> = {};

      scheduledClasses.forEach(item => {
          const key = entryKey(item.classData.id, item.periodIndex);
          const existingEntry = entries.find(e => e.classId === item.classData.id && e.date === selectedDate && e.periodIndex === item.periodIndex);
          newNotes[key] = existingEntry ? existingEntry.notes : '';
          newDirty[key] = false;
      });

      setNotesMap(newNotes);
      setIsDirtyMap(newDirty);
  }, [selectedDate, scheduledClasses, entries]);

  const handleNoteChange = (key: string, text: string) => {
      setNotesMap(prev => ({ ...prev, [key]: text }));
      setIsDirtyMap(prev => ({ ...prev, [key]: true }));
  };

  // Guardado por franja: cada tarjeta tiene su propio botón (aparece en
  // cuanto se escribe algo en ella), en vez de un único botón global que
  // guardaba todo a la vez sin indicar qué franja concreta cambió.
  const handleSaveOne = (item: { classData: ClassData, periodIndex: number }) => {
      const classId = item.classData.id;
      const key = entryKey(classId, item.periodIndex);
      const existingEntry = entries.find(e => e.classId === classId && e.date === selectedDate && e.periodIndex === item.periodIndex);
      const noteContent = notesMap[key] ?? '';

      onSave({
          id: existingEntry?.id || `j-${Date.now()}-${classId}-${item.periodIndex}-${Math.random().toString(36).substring(2, 5)}`,
          date: selectedDate,
          classId: classId,
          periodIndex: item.periodIndex,
          notes: noteContent
      });

      setIsDirtyMap(prev => ({ ...prev, [key]: false }));
  };

  // Cambiar de día descarta silenciosamente notesMap/isDirtyMap (se
  // reinicializan para el nuevo día en el useEffect de arriba): avisar antes
  // si hay algo sin guardar.
  const changeDate = (newDate: string) => {
    if (isDirty && !window.confirm('Hay anotaciones sin guardar en este día. ¿Cambiar de día sin guardar?')) return;
    setSelectedDate(newDate);
  };

  const handlePrevDay = () => changeDate(toYYYYMMDD(addDays(new Date(selectedDate), -1)));
  const handleNextDay = () => changeDate(toYYYYMMDD(addDays(new Date(selectedDate), 1)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`rounded-xl ${pageHeaderPaddingClassName} ${pageHeaderMinHeight} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4`} style={{ backgroundColor: PALETTE.green.header, ...headerPatternStyle }}>
        <div className="flex items-center gap-3">
            <ClipboardDocumentIcon className="w-6 h-6 flex-shrink-0 text-white/90" />
            <div>
                <h2 className="text-xl font-bold text-white">Diario de Clase</h2>
                <p className="text-sm text-white/80">Agenda diaria y seguimiento de sesiones.</p>
            </div>
        </div>

        <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg bg-white shadow-sm">
                <button onClick={handlePrevDay} className="p-2 text-slate-500 hover:bg-slate-100 rounded-l-lg border-r border-slate-200" title="Día anterior">
                    <ChevronLeftIcon className="w-5 h-5"/>
                </button>
                <DateNavButton
                    value={selectedDate}
                    label={selectedDate === toYYYYMMDD(new Date()) ? 'Hoy' : formatFechaEs(selectedDate)}
                    onChange={changeDate}
                    className="px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                />
                <button onClick={handleNextDay} className="p-2 text-slate-500 hover:bg-slate-100 rounded-r-lg border-l border-slate-200" title="Día siguiente">
                    <ChevronRightIcon className="w-5 h-5"/>
                </button>
            </div>
        </div>
      </div>

      {/* Búsqueda de anotaciones */}
      <div className="relative" ref={searchWrapperRef}>
        <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setIsSearchOpen(true); }}
                onFocus={() => setIsSearchOpen(true)}
                onKeyDown={e => {
                    if (e.key === 'Enter' && searchResults.length > 0) {
                        e.preventDefault();
                        handleSelectSearchResult(searchResults[0].entry.date);
                    } else if (e.key === 'Escape') {
                        setIsSearchOpen(false);
                    }
                }}
                placeholder="Buscar en anotaciones del diario..."
                className="w-full pl-10"
            />
        </div>
        {isSearchOpen && searchQuery.trim() !== '' && (
            <div className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto bg-white shadow-lg border rounded-lg divide-y">
                {searchResults.length > 0 ? searchResults.map(({ entry, classData }) => (
                    <button
                        key={entry.id}
                        type="button"
                        onClick={() => handleSelectSearchResult(entry.date)}
                        className="w-full text-left p-3 hover:bg-slate-50"
                    >
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-sm font-semibold text-slate-700">
                                <ClassLabel classData={classData} courses={courses} />
                            </span>
                            <span className="text-xs text-slate-500 flex-shrink-0">{formatFechaEs(entry.date)}</span>
                        </div>
                        <p className="text-sm text-slate-600 truncate">{entry.notes}</p>
                    </button>
                )) : (
                    <p className="p-3 text-sm text-slate-500 text-center">Sin resultados.</p>
                )}
            </div>
        )}
      </div>

      {/* Timeline / List */}
      <div className="space-y-4">
        {scheduledClasses.length === 0 ? (
            <EmptyState
                title={`No hay clases programadas para este día (${new Date(selectedDate).toLocaleDateString('es-ES', { weekday: 'long' })}).`}
                message="Revisa el horario en Ajustes si esto es incorrecto."
            />
        ) : (
            scheduledClasses.map((item) => {
                const classId = item.classData.id;
                const key = entryKey(classId, item.periodIndex);
                const accent = getClassAccentColor(getMateria(item.classData, courses), item.classData.colorAcento);
                return (
                    <div key={key} className="bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col md:flex-row">
                        {/* Sidebar / Time Info */}
                        <div className="p-4 md:w-48 flex-shrink-0 border-b md:border-b-0 md:border-r flex flex-col justify-center" style={{ backgroundColor: accent.cellBg }}>
                            <div className="flex items-center gap-2 font-bold mb-1" style={{ color: accent.text }}>
                                <ClockIcon className="w-4 h-4" />
                                <span className="text-sm uppercase tracking-wide">{item.periodName}</span>
                            </div>
                            <h3 className="font-semibold text-lg leading-tight" style={{ color: accent.text }}>
                                <ClassLabel
                                    classData={item.classData}
                                    courses={courses}
                                    grupoClassName="inline-block px-2 py-0.5 mr-1.5 rounded text-xs font-mono font-semibold align-middle"
                                    grupoStyle={{ backgroundColor: accent.pillBg, color: accent.text }}
                                />
                            </h3>
                            <p className="text-xs text-slate-500 mt-2">
                                {item.classData.students.length} Alumnos
                            </p>
                        </div>

                        {/* Content Area */}
                        <div className="flex-grow flex flex-col">
                            {/* Planned Content Box */}
                            {item.plannedContent && (
                                <div className="p-3 bg-indigo-50 border-b border-indigo-100">
                                    <div className="flex items-center gap-2 text-indigo-800 font-semibold text-xs uppercase tracking-wide mb-1">
                                        <BookOpenIcon className="w-3.5 h-3.5" />
                                        Lo Programado:
                                    </div>
                                    <p className="text-sm font-medium text-slate-800">
                                        {item.plannedContent.unitName} <span className="text-slate-500 font-normal">(Sesión {item.plannedContent.sessionNumber})</span>
                                    </p>
                                    {item.plannedContent.sessionDesc && (
                                        <p className="text-sm text-slate-600 mt-1 italic">
                                            "{item.plannedContent.sessionDesc}"
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Editable Notes Area */}
                            <div className="p-4 flex-grow">
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-medium text-slate-500">Anotaciones</label>
                                    {isDirtyMap[key] && (
                                        <IconButton
                                            label="Guardar esta anotación"
                                            tone="success"
                                            size="sm"
                                            onClick={() => handleSaveOne(item)}
                                        >
                                            <CheckCircleIcon className="w-5 h-5" />
                                        </IconButton>
                                    )}
                                </div>
                                <Textarea
                                    value={notesMap[key] || ''}
                                    onChange={(e) => handleNoteChange(key, e.target.value)}
                                    placeholder={`Anotaciones reales de la sesión (incidencias, tareas mandadas, etc.)...`}
                                    className="h-32 resize-y"
                                />
                            </div>
                        </div>
                    </div>
                );
            })
        )}
      </div>
    </div>
  );
};

export default ClassJournal;

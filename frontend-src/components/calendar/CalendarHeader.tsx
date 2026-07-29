import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon, CalendarDaysIcon, ViewWeekIcon, ViewDayIcon } from '../Icons';
import { PALETTE } from '../../theme/palette';
import { pageHeaderMinHeight, pageHeaderPaddingClassName } from '../../theme/components/PageHeader';
import { headerPatternStyle } from '../../theme/headerPattern';

const CalendarHeader: React.FC<{
    currentDate: Date;
    view: 'month' | 'week' | 'day';
    setView: (view: 'month' | 'week' | 'day') => void;
    onPrev: () => void;
    onNext: () => void;
    onToday: () => void;
}> = ({ currentDate, view, setView, onPrev, onNext, onToday }) => (
    <div className={`flex items-center justify-between rounded-t-xl ${pageHeaderPaddingClassName} ${pageHeaderMinHeight} flex-wrap gap-3`} style={{ backgroundColor: PALETTE.navy.header, ...headerPatternStyle }}>
        <div className="flex items-center gap-4 flex-wrap">
             <div className="flex items-center gap-3">
                <CalendarDaysIcon className="w-6 h-6 flex-shrink-0 text-white/90" />
                <h2 className="text-xl font-bold text-white">
                    {currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
                </h2>
             </div>
            <div className="flex items-center bg-white rounded-lg overflow-hidden">
                <button onClick={onPrev} className="p-2 text-slate-500 hover:bg-slate-100"><ChevronLeftIcon className="w-5 h-5"/></button>
                <button onClick={onToday} className="px-3 py-1.5 text-sm font-semibold border-x border-slate-200 text-slate-700 hover:bg-slate-100">Hoy</button>
                <button onClick={onNext} className="p-2 text-slate-500 hover:bg-slate-100"><ChevronRightIcon className="w-5 h-5"/></button>
            </div>
        </div>
        <div className="flex items-center gap-1 p-1 bg-white/15 rounded-lg">
            <button onClick={() => setView('month')} className={`px-3 py-1 text-sm font-semibold rounded-md flex items-center gap-1.5 ${view === 'month' ? 'bg-white text-slate-800 shadow-sm' : 'text-white hover:bg-white/15'}`}>
                <CalendarDaysIcon className="w-4 h-4" /> Mes
            </button>
            <button onClick={() => setView('week')} className={`px-3 py-1 text-sm font-semibold rounded-md flex items-center gap-1.5 ${view === 'week' ? 'bg-white text-slate-800 shadow-sm' : 'text-white hover:bg-white/15'}`}>
                <ViewWeekIcon className="w-4 h-4" /> Semana
            </button>
            <button onClick={() => setView('day')} className={`px-3 py-1 text-sm font-semibold rounded-md flex items-center gap-1.5 ${view === 'day' ? 'bg-white text-slate-800 shadow-sm' : 'text-white hover:bg-white/15'}`}>
                <ViewDayIcon className="w-4 h-4" /> Día
            </button>
        </div>
    </div>
);

export default CalendarHeader;

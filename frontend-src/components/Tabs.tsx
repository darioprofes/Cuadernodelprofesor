import React from 'react';
import { tabItemActiveClassName, tabItemActiveStyle, tabItemBaseClassName, tabItemInactiveClassName, tabsRowClassName } from '../theme/components/Tabs';

export interface TabItem<T extends string> {
    id: T;
    label: string;
}

interface TabsProps<T extends string> {
    items: TabItem<T>[];
    activeId: T;
    onChange: (id: T) => void;
    className?: string;
    /** Color de la pestaña activa -- por defecto el azul-marino genérico
     * (ver theme/components/Tabs.ts). Pásalo cuando la pantalla tiene su
     * propio PAGE_ACCENT y conviene que las pestañas lo reflejen. */
    accentColor?: string;
}

function Tabs<T extends string>({ items, activeId, onChange, className = '', accentColor }: TabsProps<T>) {
    return (
        <div className={`${tabsRowClassName} ${className}`}>
            {items.map(item => (
                <button
                    key={item.id}
                    onClick={() => onChange(item.id)}
                    className={`${tabItemBaseClassName} ${item.id === activeId ? tabItemActiveClassName : tabItemInactiveClassName}`}
                    style={item.id === activeId ? tabItemActiveStyle(accentColor) : undefined}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}

export default Tabs;

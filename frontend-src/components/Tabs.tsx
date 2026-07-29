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
}

function Tabs<T extends string>({ items, activeId, onChange, className = '' }: TabsProps<T>) {
    return (
        <div className={`${tabsRowClassName} ${className}`}>
            {items.map(item => (
                <button
                    key={item.id}
                    onClick={() => onChange(item.id)}
                    className={`${tabItemBaseClassName} ${item.id === activeId ? tabItemActiveClassName : tabItemInactiveClassName}`}
                    style={item.id === activeId ? tabItemActiveStyle : undefined}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}

export default Tabs;

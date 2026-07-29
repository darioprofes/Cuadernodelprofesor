import { describe, it, expect } from 'vitest';
import { runMigrations, CURRENT_SCHEMA_VERSION } from './migrations';

// Forma previa a la migración v2 (types.ts ya no declara estos campos, es
// justo lo que se comprueba que desaparece).
interface LegacyStudent {
    domicilioDireccion?: string;
    domicilioTelefono?: string;
    medidasEducativas?: string;
    observacionesTutor?: string;
    domicilio?: string;
    telefonoContacto?: string;
    datosFamiliares?: string;
    adaptaciones?: string;
}

describe('runMigrations', () => {
    it('fills in missing top-level collections on a pre-versioning blob (schemaVersion absent = version 0)', () => {
        const raw = { classes: [], keyCompetences: [], competences: [], criteria: [] };
        const migrated = runMigrations(raw);
        expect(migrated.evaluationTools).toEqual([]);
        expect(migrated.tasks).toEqual([]);
        expect(migrated.meetings).toEqual([]);
        expect(migrated.agendaNotes).toEqual([]);
        expect(migrated.shortcuts).toBeDefined();
        expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    });

    it('does not clobber existing values that are already present', () => {
        const raw = { tasks: [{ id: 't1', texto: 'ya existente', hecho: false }] };
        const migrated = runMigrations(raw);
        expect(migrated.tasks).toEqual([{ id: 't1', texto: 'ya existente', hecho: false }]);
    });

    it('is idempotent: re-running on an already-current blob changes nothing but the version stamp', () => {
        const once = runMigrations({});
        const twice = runMigrations(once);
        expect(twice).toEqual(once);
    });

    it('skips migrations already applied when schemaVersion is at the current version', () => {
        const alreadyMigrated = { schemaVersion: CURRENT_SCHEMA_VERSION, tasks: ['sentinel'] };
        const result = runMigrations(alreadyMigrated);
        expect(result.tasks).toEqual(['sentinel']);
    });

    it('folds legacy Student fields (domicilio/telefonoContacto/datosFamiliares/adaptaciones) into their structured replacements and drops them', () => {
        const raw = {
            schemaVersion: 1,
            classes: [{
                id: 'c1', courseId: 'course1', categories: [], assignments: [], grades: [],
                students: [{
                    id: 's1', name: 'Alumno', acneae: [],
                    domicilio: 'Calle Falsa 123',
                    telefonoContacto: '600111222',
                    datosFamiliares: 'Vive con sus abuelos',
                    adaptaciones: 'Tiempo extra en exámenes',
                }],
            }],
        };
        const migrated = runMigrations(raw);
        const student: LegacyStudent = migrated.classes[0].students[0];
        expect(student.domicilioDireccion).toBe('Calle Falsa 123');
        expect(student.domicilioTelefono).toBe('600111222');
        expect(student.medidasEducativas).toBe('Tiempo extra en exámenes');
        expect(student.observacionesTutor).toContain('Vive con sus abuelos');
        expect(student.domicilio).toBeUndefined();
        expect(student.telefonoContacto).toBeUndefined();
        expect(student.datosFamiliares).toBeUndefined();
        expect(student.adaptaciones).toBeUndefined();
    });

    it('does not overwrite already-structured fields with legacy ones', () => {
        const raw = {
            schemaVersion: 1,
            classes: [{
                id: 'c1', courseId: 'course1', categories: [], assignments: [], grades: [],
                students: [{
                    id: 's1', name: 'Alumno', acneae: [],
                    domicilioDireccion: 'Ya estructurado',
                    domicilio: 'Legacy, no debería ganar',
                }],
            }],
        };
        const migrated = runMigrations(raw);
        const student: LegacyStudent = migrated.classes[0].students[0];
        expect(student.domicilioDireccion).toBe('Ya estructurado');
    });
});

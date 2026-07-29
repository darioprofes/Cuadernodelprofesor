import type { AppState } from '../types';
import { INITIAL_SHORTCUTS } from '../constants';

// Sistema de migraciones del blob guardado (ver App.tsx::useDatabase).
// Antes de esto, los campos nuevos de AppState se "rescataban" a mano con
// comprobaciones `if (!loadedState.x)` sueltas en loadDataFromDb, sin ningún
// registro de qué versión tenía el blob ni garantía de que se aplicaran en
// orden. Aquí cada cambio de forma del estado es un paso versionado y
// explícito: se aplican en orden todas las migraciones con `version` mayor
// que `schemaVersion` del estado cargado, y el resultado queda marcado con
// CURRENT_SCHEMA_VERSION. Las migraciones son historial: no se editan ni
// renumeran una vez publicadas, solo se añaden nuevas al final.
export const CURRENT_SCHEMA_VERSION = 2;

interface Migration {
    version: number;
    description: string;
    // any deliberado: el estado de entrada puede venir de cualquier versión
    // de esquema anterior (por eso existe este sistema), así que nunca se
    // puede tipar como AppState — tipar esto como AppState escondería el
    // problema en vez de resolverlo. La salida final se valida contra
    // AppState solo al terminar toda la cadena, en runMigrations.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    migrate: (state: any) => any;
}

const MIGRATIONS: Migration[] = [
    {
        version: 1,
        description: 'Asegura las colecciones de nivel superior añadidas tras el primer despliegue (instrumentos de evaluación, tareas, reuniones, notas de agenda, accesos directos), antes gestionado a mano en loadDataFromDb.',
        migrate: (state) => ({
            ...state,
            evaluationTools: state.evaluationTools ?? [],
            tasks: state.tasks ?? [],
            meetings: state.meetings ?? [],
            agendaNotes: state.agendaNotes ?? [],
            shortcuts: state.shortcuts ?? INITIAL_SHORTCUTS,
        }),
    },
    {
        version: 2,
        description: 'Vuelca los campos antiguos y sin estructurar de la ficha del alumno (domicilio, telefonoContacto, datosFamiliares, adaptaciones) en los campos nuevos y estructurados que los sustituyeron, y los retira del modelo — ya no se editan desde ningún sitio, solo se leían como fallback.',
        migrate: (state) => ({
            ...state,
            // any en cls/s: forma de un ClassData/Student histórico (pre-migración),
            // con campos (domicilio, telefonoContacto...) que ya no existen en los
            // tipos actuales — es justo lo que esta migración retira.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            classes: (state.classes ?? []).map((cls: any) => ({
                ...cls,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                students: (cls.students ?? []).map((s: any) => {
                    const { domicilio, telefonoContacto, datosFamiliares, adaptaciones, ...rest } = s;
                    const migrated = { ...rest };
                    if (!migrated.domicilioDireccion && domicilio) migrated.domicilioDireccion = domicilio;
                    if (!migrated.domicilioTelefono && telefonoContacto) migrated.domicilioTelefono = telefonoContacto;
                    if (!migrated.medidasEducativas && adaptaciones) migrated.medidasEducativas = adaptaciones;
                    if (datosFamiliares) {
                        migrated.observacionesTutor = migrated.observacionesTutor
                            ? `${migrated.observacionesTutor}\n\nDatos familiares (migrado): ${datosFamiliares}`
                            : `Datos familiares (migrado): ${datosFamiliares}`;
                    }
                    return migrated;
                }),
            })),
        }),
    },
];

// any deliberado: rawState es el JSON tal cual sale del blob (cualquier
// versión histórica de esquema), sin validar todavía — runMigrations es
// precisamente lo que lo lleva a un AppState válido, por eso es su tipo
// de retorno pero no puede serlo también de entrada.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const runMigrations = (rawState: any): AppState => {
    const fromVersion: number = rawState.schemaVersion ?? 0;
    const pending = MIGRATIONS
        .filter(m => m.version > fromVersion)
        .sort((a, b) => a.version - b.version);

    let state = rawState;
    for (const migration of pending) {
        state = migration.migrate(state);
    }

    return { ...state, schemaVersion: CURRENT_SCHEMA_VERSION };
};

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// Configuración deliberadamente ligera: el objetivo es cazar errores reales
// (hooks mal usados, variables sin usar, imports rotos), no imponer un estilo
// de formateo — no hay Prettier ni reglas de estilo aquí. `noImplicitAny` en
// tsconfig.json sigue desactivado a propósito (ver el comentario allí), así
// que tampoco se activan aquí las reglas `@typescript-eslint` que dependen
// de tipos completos (`recommendedTypeChecked`) — darían miles de avisos por
// la misma razón.
export default tseslint.config(
    { ignores: ['dist/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.browser,
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
            // El propio proyecto usa `any` a propósito en varios sitios
            // (tipos unión complejos en EvaluationToolManager/CurriculumManager,
            // ver auditoría) — aviso, no error, hasta que se tipen mejor.
            '@typescript-eslint/no-explicit-any': 'warn',
            // ignoreRestSiblings: el propio código usa a propósito el patrón
            // `const { campoAQuitar, ...resto } = objeto` para eliminar un campo
            // (ver CurriculumManager.tsx), no es una variable olvidada.
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
        },
    },
);

import { useState } from 'react';
import type { BasicKnowledge, EvaluationCriterion, KeyCompetence, OperationalDescriptor, SpecificCompetence } from '../types';
import type { CurriculumPreset } from '../curriculumPresets';
import { api } from '../services/api';
import {
    useCreateSpecificCompetence, useDeleteSpecificCompetence, useLinkDescriptor,
} from './useSpecificCompetences';
import { useCreateCriterion, useDeleteCriterion } from './useEvaluationCriteria';
import { useCreateBasicKnowledge, useDeleteBasicKnowledge } from './useBasicKnowledge';

// Extraído de CurriculumManager.tsx (Gestionar Currículo) para poder
// reutilizarlo tal cual desde cualquier otro sitio que necesite cargar un
// currículo oficial/CSV sobre un curso -- p.ej. al crear una Materia nueva
// (CourseManager.tsx). Misma lógica, cero cambios de comportamiento; solo
// cambia la forma de recibir el curso (antes buscaba en un array `courses`
// completo por id, ahora recibe directamente `{id, level, subject}`, dato
// que un curso recién creado ya tiene en la mano sin necesitar la lista
// entera).
//
// KC/OD (competencias clave y descriptores operativos) siguen viniendo de
// fuera como callbacks -- son globales al sistema, no por curso, y su
// creación real vive en App.tsx (mismo patrón que ya usaba
// CurriculumManager.tsx, sin cambios).

const isBachilleratoStage = (level: string): boolean => /bach/i.test(level);

const parseCurriculumCsv = (csvText: string, courseId: string, existingSpecificCompetences: SpecificCompetence[]) => {
    const lines = csvText.split(/\r\n|\n/).filter(line => line.trim() !== '');
    if (lines.length < 1) return { newKCs: [], newODs: [], newSCs: [], newECs: [], newSBs: [], avisos: [] };

    const avisos: string[] = [];

    const headerLine = lines.shift()!;
    const numLinkColumns = headerLine.split(',').filter(h => /^link\d+$/i.test(h.trim())).length;

    const newKCs: (Omit<KeyCompetence, 'descriptors'>)[] = [];
    const newODs: (OperationalDescriptor & { parentKcId: string })[] = [];
    const newSCs: SpecificCompetence[] = [];
    const newECs: EvaluationCriterion[] = [];
    const newSBs: BasicKnowledge[] = [];

    const parseCsvLine = (line: string): string[] => {
        const result: string[] = [];
        let currentVal = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                    currentVal += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(currentVal.trim());
                currentVal = "";
            } else {
                currentVal += char;
            }
        }
        result.push(currentVal.trim());
        return result;
    };

    const localScCodeToIdMap = new Map<string, string>();
    const bloqueLetraToNombre = new Map<string, string>();

    lines.forEach(line => {
        const parts = parseCsvLine(line);
        const [type, id, code, description] = parts;
        if (type?.toUpperCase() === 'SC' && id && code) {
            localScCodeToIdMap.set(code, id);
        }
        if (type?.toUpperCase() === 'BB' && code && description) {
            bloqueLetraToNombre.set(code.toUpperCase(), description);
        }
    });

    for (const line of lines) {
        const parts = parseCsvLine(line);
        const [type, id, code, description, ...rest] = parts;
        const links = numLinkColumns > 0 ? rest.slice(0, numLinkColumns) : rest;
        if (!type || !id || !code || !description) continue;
        const commonData = { id, code, description };

        switch (type.toUpperCase()) {
            case 'KC':
                newKCs.push({ ...commonData });
                break;
            case 'OD':
                newODs.push({ ...commonData, parentKcId: links[0] });
                break;
            case 'SC': {
                const scData = { ...commonData, courseId, keyCompetenceDescriptorIds: links.filter(l => l) };
                newSCs.push(scData);
                break;
            }
            case 'EC': {
                const criterionCode = commonData.code;
                const competenceNumberMatch = criterionCode.match(/^(\d+)\./);
                let competenceId = links[0] || '';

                if (competenceNumberMatch && competenceNumberMatch[1]) {
                    const targetScCode = `CEs ${competenceNumberMatch[1].trim()}`;
                    if (localScCodeToIdMap.has(targetScCode)) {
                        competenceId = localScCodeToIdMap.get(targetScCode)!;
                    } else {
                        const existingSc = existingSpecificCompetences.find(sc => sc.code === targetScCode && sc.courseId === courseId);
                        if (existingSc) {
                            competenceId = existingSc.id;
                            const aviso = `El criterio '${criterionCode}' se ha vinculado a una competencia específica existente ('${targetScCode}') porque no había una con ese código en el archivo importado.`;
                            console.warn(aviso);
                            avisos.push(aviso);
                        } else {
                            const aviso = `No se pudo vincular el criterio '${criterionCode}': no existe ninguna competencia específica con el código '${targetScCode}' ni en este curso ni en el archivo importado.`;
                            console.error(aviso);
                            avisos.push(aviso);
                        }
                    }
                }
                newECs.push({ ...commonData, courseId: courseId, competenceId: competenceId });
                break;
            }
            case 'SB': {
                const letraBloque = commonData.code.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase();
                const blockName = letraBloque ? bloqueLetraToNombre.get(letraBloque) ?? null : null;
                newSBs.push({ ...commonData, courseId, blockName });
                break;
            }
        }
    }
    return { newKCs, newODs, newSCs, newECs, newSBs, avisos };
};

interface CursoParaImportar {
    id: string;
    level: string;
    subject: string;
}

interface UseCurriculumImportProps {
    keyCompetences: KeyCompetence[];
    onCreateKeyCompetence: (data: { code: string; description: string }) => Promise<KeyCompetence>;
    onUpdateKeyCompetence: (id: string, data: Partial<{ code: string; description: string }>) => Promise<void>;
    onCreateDescriptor: (keyCompetenceId: string, data: { code: string; description: string; stage?: 'eso' | 'bachillerato' }) => Promise<OperationalDescriptor>;
    onUpdateDescriptor: (id: string, data: Partial<{ code: string; description: string; stage: 'eso' | 'bachillerato' }>) => Promise<void>;
}

export function useCurriculumImport({
    keyCompetences, onCreateKeyCompetence, onUpdateKeyCompetence, onCreateDescriptor, onUpdateDescriptor,
}: UseCurriculumImportProps) {
    const [importando, setImportando] = useState(false);

    const createCompetence = useCreateSpecificCompetence();
    const deleteCompetenceMutation = useDeleteSpecificCompetence();
    const linkDescriptorMutation = useLinkDescriptor();
    const createCriterionMutation = useCreateCriterion();
    const deleteCriterionMutation = useDeleteCriterion();
    const createBasicKnowledgeMutation = useCreateBasicKnowledge();
    const deleteBasicKnowledgeMutation = useDeleteBasicKnowledge();

    const confirmarReemplazo = (course: { level: string; subject: string }): boolean => {
        const stage = isBachilleratoStage(course.level) ? 'Bachillerato' : 'ESO';
        const courseName = `${course.level} - ${course.subject}`;

        const confirmationMessage = `Se va a importar el currículo para el curso '${courseName}'.\n\n` +
            `- Competencias Específicas, Criterios y Saberes de ESTE CURSO serán reemplazados.\n` +
            `- Descriptores Operativos para la etapa '${stage}' serán FUSIONADOS inteligentemente por código (ej. CCL1) para evitar duplicados.\n` +
            `- Los datos de otros cursos no se verán afectados.\n\n` +
            `¿Deseas continuar?`;

        return window.confirm(confirmationMessage);
    };

    const syncKeyCompetencesFromImport = async (
        newKCs: (Omit<KeyCompetence, 'descriptors'>)[],
        augmentedODs: (OperationalDescriptor & { parentKcId: string })[],
        stage: 'eso' | 'bachillerato',
    ): Promise<Map<string, string>> => {
        const odIdReplacementMap = new Map<string, string>();
        const importKcIdToCodeMap = new Map(newKCs.map(kc => [kc.id, kc.code]));

        const newODsByParentCode = new Map<string, (OperationalDescriptor & { parentKcId: string })[]>();
        augmentedODs.forEach(od => {
            const parentCode = importKcIdToCodeMap.get(od.parentKcId);
            if (parentCode) {
                if (!newODsByParentCode.has(parentCode)) newODsByParentCode.set(parentCode, []);
                newODsByParentCode.get(parentCode)!.push(od);
            }
        });

        const kcByCode = new Map(keyCompetences.map(kc => [kc.code, kc]));

        for (const nkc of newKCs) {
            let kc = kcByCode.get(nkc.code);
            if (!kc) {
                const created = await onCreateKeyCompetence({ code: nkc.code, description: nkc.description });
                kc = { ...created, descriptors: [] };
                kcByCode.set(nkc.code, kc);
            } else if (kc.description !== nkc.description) {
                await onUpdateKeyCompetence(kc.id, { description: nkc.description });
            }

            const currentStageDescriptors = (kc.descriptors || []).filter(d => d.stage === stage);
            const existingByCode = new Map(currentStageDescriptors.map(d => [d.code, d]));
            const newDescriptorsForThisKC = newODsByParentCode.get(nkc.code) || [];

            for (const newDesc of newDescriptorsForThisKC) {
                const existing = existingByCode.get(newDesc.code);
                if (existing) {
                    odIdReplacementMap.set(newDesc.id, existing.id);
                    if (existing.description !== newDesc.description) {
                        await onUpdateDescriptor(existing.id, { description: newDesc.description });
                    }
                } else {
                    const createdDescriptor = await onCreateDescriptor(kc.id, { code: newDesc.code, description: newDesc.description, stage });
                    odIdReplacementMap.set(newDesc.id, createdDescriptor.id);
                }
            }
        }

        return odIdReplacementMap;
    };

    const syncCourseContentFromImport = async (
        courseId: string,
        newSCs: SpecificCompetence[],
        newECs: EvaluationCriterion[],
        newSBs: BasicKnowledge[],
        odIdReplacementMap: Map<string, string>,
        suffix: string,
    ): Promise<void> => {
        const augmentId = (id: string, suffixToAdd: string) => (id.endsWith('-eso') || id.endsWith('-bach')) ? id : id + suffixToAdd;

        const [existingCriteria, existingCompetences, existingBasicKnowledge] = await Promise.all([
            api.get<EvaluationCriterion[]>(`/courses/${courseId}/criteria`),
            api.get<SpecificCompetence[]>(`/courses/${courseId}/competences`),
            api.get<BasicKnowledge[]>(`/courses/${courseId}/basic-knowledge`),
        ]);

        for (const c of existingCriteria) await deleteCriterionMutation.mutateAsync({ id: c.id, courseId });
        for (const sc of existingCompetences) await deleteCompetenceMutation.mutateAsync({ id: sc.id, courseId });
        for (const sb of existingBasicKnowledge) await deleteBasicKnowledgeMutation.mutateAsync({ id: sb.id, courseId });

        const scIdReplacementMap = new Map<string, string>();
        for (const sc of newSCs) {
            const created = await createCompetence.mutateAsync({ courseId, data: { code: sc.code, description: sc.description } });
            scIdReplacementMap.set(sc.id, created.id);

            const rawDescriptorIds = sc.keyCompetenceDescriptorIds.map(id => augmentId(id, suffix));
            const resolvedDescriptorIds = Array.from(new Set(rawDescriptorIds.map(id => odIdReplacementMap.get(id) ?? id)));
            for (const descriptorId of resolvedDescriptorIds) {
                await linkDescriptorMutation.mutateAsync({ competenceId: created.id, courseId, descriptorId });
            }
        }

        for (const ec of newECs) {
            const resolvedCompetenceId = scIdReplacementMap.get(ec.competenceId) ?? ec.competenceId;
            await createCriterionMutation.mutateAsync({
                courseId,
                data: { competenceId: resolvedCompetenceId, code: ec.code, description: ec.description, weight: ec.weight, excludeFromWeighting: ec.excludeFromWeighting ?? false },
            });
        }

        for (const sb of newSBs) {
            await createBasicKnowledgeMutation.mutateAsync({ courseId, data: { code: sb.code, description: sb.description, blockName: sb.blockName } });
        }
    };

    const updateCurriculumState = async ({ newKCs, newODs, newSCs, newECs, newSBs, avisos }: {
        newKCs: (Omit<KeyCompetence, 'descriptors'>)[];
        newODs: (OperationalDescriptor & { parentKcId: string })[];
        newSCs: SpecificCompetence[];
        newECs: EvaluationCriterion[];
        newSBs: BasicKnowledge[];
        avisos: string[];
    }, course: CursoParaImportar) => {
        if ([newKCs, newODs, newSCs, newECs, newSBs].every(arr => arr.length === 0)) {
            alert("No se encontraron elementos curriculares válidos en el archivo.");
            return;
        }

        const isBachStage = isBachilleratoStage(course.level);
        const stage = isBachStage ? 'Bachillerato' : 'ESO';
        const suffix = isBachStage ? '-bach' : '-eso';
        const stageValue: 'eso' | 'bachillerato' = isBachStage ? 'bachillerato' : 'eso';

        const augmentId = (id: string, suffixToAdd: string) => {
            if (id.endsWith('-eso') || id.endsWith('-bach')) {
                return id;
            }
            return id + suffixToAdd;
        };

        const augmentedODs = newODs.map(od => ({ ...od, id: augmentId(od.id, suffix) }));

        const odIdReplacementMap = await syncKeyCompetencesFromImport(newKCs, augmentedODs, stageValue);
        await syncCourseContentFromImport(course.id, newSCs, newECs, newSBs, odIdReplacementMap, suffix);

        const courseName = `${course.level} - ${course.subject}`;
        alert(
            `Currículo para '${courseName}' (${stage.toUpperCase()}) importado con éxito.\n\nSe ha aplicado una fusión `
            + 'inteligente de Descriptores Operativos para evitar duplicados entre cursos.'
            + (avisos.length > 0 ? `\n\nAvisos (${avisos.length}):\n${avisos.join('\n')}` : '')
        );
    };

    const cargarDesdeTexto = async (course: CursoParaImportar, csvText: string, existingSpecificCompetences: SpecificCompetence[]) => {
        setImportando(true);
        try {
            const parsedData = parseCurriculumCsv(csvText, course.id, existingSpecificCompetences);
            await updateCurriculumState(parsedData, course);
        } catch (error) {
            console.error('Error parsing CSV:', error);
            alert('Error al procesar el archivo CSV. Comprueba el formato, el contenido y la codificación del archivo (UTF-8 o UTF-16).');
        } finally {
            setImportando(false);
        }
    };

    // Igual que handleCargarPreset en CurriculumManager.tsx: pide confirmación
    // (currículo propio no oficial, y reemplazo), descarga el CSV del preset
    // y lo importa igual que un CSV subido a mano.
    const cargarDesdePreset = async (course: CursoParaImportar, preset: CurriculumPreset, existingSpecificCompetences: SpecificCompetence[]) => {
        if (!preset.oficial && !window.confirm(
            `"${preset.etiqueta}" NO es un currículo oficial: es uno propio, no correspondiente al decreto LOMLOE. ¿Seguro que quieres importarlo?`
        )) return;

        if (!confirmarReemplazo(course)) return;

        try {
            const response = await fetch(preset.ruta);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            await cargarDesdeTexto(course, text, existingSpecificCompetences);
        } catch (error) {
            console.error('Error cargando currículo preseleccionado:', error);
            alert('No se pudo cargar el currículo seleccionado.');
        }
    };

    return { importando, cargarDesdeTexto, cargarDesdePreset, confirmarReemplazo };
}

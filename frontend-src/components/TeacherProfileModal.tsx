import React from 'react';
import type { AcademicConfiguration } from '../types';
import Modal from './Modal';
import TeacherProfileManager from './settings/TeacherProfileManager';

// Modal independiente de "Ajustes de la Aplicación" a propósito -- se
// abre directamente desde el avatar/nombre de la cabecera, no desde el
// menú de Ajustes (pedido explícito del usuario: sacarlo de ese modal).
const TeacherProfileModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    academicConfiguration: AcademicConfiguration;
    setAcademicConfiguration: (updater: React.SetStateAction<AcademicConfiguration>) => void;
}> = ({ isOpen, onClose, academicConfiguration, setAcademicConfiguration }) => (
    <Modal isOpen={isOpen} onClose={onClose} title="Perfil Docente" size="2xl">
        <TeacherProfileManager academicConfiguration={academicConfiguration} setAcademicConfiguration={setAcademicConfiguration} />
    </Modal>
);

export default TeacherProfileModal;

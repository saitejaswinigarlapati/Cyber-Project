import React, { createContext, useContext, useState } from 'react';

type ModalType = 'upload' | 'folder' | 'createFile' | null;

interface ModalContextType {
  activeModal: ModalType;
  openModal: (type: ModalType) => void;
  closeModal: () => void;
  uploadFolderMode: boolean;
  setUploadFolderMode: (val: boolean) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [uploadFolderMode, setUploadFolderMode] = useState(false);

  const openModal = (type: ModalType) => {
    setActiveModal(type);
    if (type !== 'upload') setUploadFolderMode(false);
  };
  
  const closeModal = () => setActiveModal(null);

  return (
    <ModalContext.Provider value={{ activeModal, openModal, closeModal, uploadFolderMode, setUploadFolderMode }}>
      {children}
    </ModalContext.Provider>
  );
};

export const useModals = () => {
  const context = useContext(ModalContext);
  if (!context) throw new Error('useModals must be used within a ModalProvider');
  return context;
};

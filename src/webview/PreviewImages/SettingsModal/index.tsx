import { Modal, Button, Input } from "antd";
import React, { FC } from "react";
import { useState } from "react";

const { TextArea } = Input;

interface ISettingsModalProps {
  includeFolders: string;
  excludeFolders: string;
  visible: boolean;
  // eslint-disable-next-line no-unused-vars
  onApply: (includeFolders: string, excludeFolders: string) => void;
  onClose: () => void;
}

const SettingsModal: FC<ISettingsModalProps> = ({
  includeFolders: initIncludeFolders,
  excludeFolders: initExcludeFolders,
  visible,
  onApply,
  onClose
}) => {
  const [includeFolders, setIncludeFolders] = useState(initIncludeFolders);
  const [excludeFolders, setExcludeFolders] = useState(initExcludeFolders);

  const handleApply = () => {
    const includeFoldersArray = includeFolders.split("\n");
    const excludeFoldersArray = excludeFolders.split("\n");
    console.log("Include Folders:", includeFoldersArray);
    console.log("Exclude Folders:", excludeFoldersArray);
    onApply(includeFolders, excludeFolders);
    onClose();
  };

  return (
    <Modal open={visible} onCancel={onClose} footer={null}>
      <div>Including these directories, 1 directory per line</div>
      <TextArea
        placeholder="e.g. assets"
        value={includeFolders}
        onChange={(e) => setIncludeFolders(e.target.value)}
      />
      <div>Excluding these directories, 1 directory per line</div>
      <TextArea
        placeholder="Exclude Folders e.g. dist/assets"
        value={excludeFolders}
        onChange={(e) => setExcludeFolders(e.target.value)}
      />
      <Button onClick={handleApply}>Apply</Button>
      <Button onClick={onClose}>Cancel</Button>
    </Modal>
  );
};

export default SettingsModal;
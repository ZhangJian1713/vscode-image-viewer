import { Modal, Button, Input, Space } from "antd";
import React, { FC } from "react";
import { useState } from "react";

const { TextArea } = Input;

interface ISettingsModalProps {
  includeFolders: string[];
  excludeFolders: string[];
  visible: boolean;
  // eslint-disable-next-line no-unused-vars
  onApply: (includeFolders: string[], excludeFolders: string[]) => void;
  onClose: () => void;
}

const SettingsModal: FC<ISettingsModalProps> = ({
  includeFolders: initIncludeFolders,
  excludeFolders: initExcludeFolders,
  visible,
  onApply,
  onClose
}) => {
  const [includeFolders, setIncludeFolders] = useState<string>(initIncludeFolders.join("\n"));
  const [excludeFolders, setExcludeFolders] = useState<string>(initExcludeFolders.join("\n"));

  const handleApply = () => {
    const includeFoldersArray = includeFolders.split("\n").map(i => i.trim()).filter(i => i);
    const excludeFoldersArray = excludeFolders.split("\n").map(i => i.trim()).filter(i => i);
    onApply(includeFoldersArray, excludeFoldersArray);
    onClose();
  };

  return (
    <Modal title='Settings' open={visible} onCancel={onClose} footer={null} destroyOnClose>
      <div>Enter directories to <b>include</b> in search, one per line</div>
      <TextArea
        autoSize={{ minRows: 5, maxRows: 10 }}
        placeholder="e.g. assets"
        value={includeFolders}
        onChange={(e) => setIncludeFolders(e.target.value)}
      />
      <div style={{ margin: '20px 0 0 0' }}>Enter directories to <b>exclude</b> from search, one per line</div>
      <TextArea
        autoSize={{ minRows: 5, maxRows: 10 }}
        placeholder="e.g. dist/assets"
        value={excludeFolders}
        onChange={(e) => setExcludeFolders(e.target.value)}
      />
      <Space style={{ margin: '20px 0 0 0' }}>
        <Button type="primary" onClick={handleApply}>Save & Apply</Button>
        <Button onClick={onClose}>Cancel</Button>
      </Space>
    </Modal>
  );
};

export default SettingsModal;
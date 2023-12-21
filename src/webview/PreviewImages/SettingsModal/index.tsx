import { Modal, Button, Input, Space, Checkbox } from "antd";
import React, { FC } from "react";
import { useState } from "react";
import { IConfigWorkspaceFolders } from "types";

const { TextArea } = Input;

interface ISettingsModalProps {
  includeFolders: string[];
  excludeFolders: string[];
  includeProjectFolders: IConfigWorkspaceFolders;
  visible: boolean;
  // eslint-disable-next-line no-unused-vars
  onApply: (includeFolders: string[], excludeFolders: string[], includeProjectFolders: IConfigWorkspaceFolders) => void;
  onClose: () => void;
}

const SettingsModal: FC<ISettingsModalProps> = ({
  includeFolders: initIncludeFolders,
  excludeFolders: initExcludeFolders,
  includeProjectFolders: initIncludeProjectFolders,
  visible,
  onApply,
  onClose
}) => {
  const [includeFolders, setIncludeFolders] = useState<string>(initIncludeFolders.join("\n"));
  const [excludeFolders, setExcludeFolders] = useState<string>(initExcludeFolders.join("\n"));
  const [includeProjectFolders, setIncludeProjectFolders] = useState<IConfigWorkspaceFolders>(initIncludeProjectFolders);

  const handleApply = () => {
    const includeFoldersArray = includeFolders.split("\n").map(i => i.trim()).filter(i => i);
    const excludeFoldersArray = excludeFolders.split("\n").map(i => i.trim()).filter(i => i);
    onApply(includeFoldersArray, excludeFoldersArray, includeProjectFolders);
    onClose();
  };

  const projectFolderKeys = Object.keys(includeProjectFolders);

  return (
    <Modal title='Settings' open={visible} onCancel={onClose} footer={null} destroyOnClose>
      {projectFolderKeys.length > 1 && [
        <div>Choose which project folders to search</div>,
        projectFolderKeys.map((folder) => {
          const checked = includeProjectFolders[folder];
          return <Checkbox checked={checked} onChange={(e) => setIncludeProjectFolders(Object.assign({}, includeProjectFolders, {[folder]:!checked}))}>
            {folder.substring(folder.lastIndexOf('/') + 1)}
          </Checkbox>
        }),
      ]}
      <div style={projectFolderKeys.length > 1 ? { margin: '20px 0 0 0' } : undefined}>Enter directories to <b>include</b> in search, one per line</div>
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
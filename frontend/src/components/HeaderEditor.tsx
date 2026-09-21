import { Table, Input, Button } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { Header } from '../types';

interface HeaderEditorProps {
  headers: Header[];
  onChange: (headers: Header[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  emptyText?: string;
  addText?: string;
}

interface HeaderRow extends Header {
  index: number;
}

const HeaderEditor = ({
  headers,
  onChange,
  keyPlaceholder = 'Header Key',
  valuePlaceholder = 'Header Value',
  emptyText = '暂无 Headers，点击下方按钮添加',
  addText = '添加 Header',
}: HeaderEditorProps) => {
  const handleAdd = () => {
    onChange([...headers, { key: '', value: '', enabled: true }]);
  };

  const handleRemove = (index: number) => {
    const next = [...headers];
    next.splice(index, 1);
    onChange(next);
  };

  const handleUpdate = (index: number, field: 'key' | 'value' | 'enabled', value: string | boolean) => {
    const next = [...headers];
    if (next[index]) {
      next[index][field] = value as never;
      onChange(next);
    }
  };

  const columns = [
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 60,
      render: (enabled: boolean, record: HeaderRow) => (
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => handleUpdate(record.index, 'enabled', e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
      ),
    },
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      width: '35%',
      render: (key: string, record: HeaderRow) => (
        <Input
          placeholder={keyPlaceholder}
          value={key}
          onChange={(e) => handleUpdate(record.index, 'key', e.target.value)}
          size="small"
        />
      ),
    },
    {
      title: 'Value',
      dataIndex: 'value',
      key: 'value',
      width: '50%',
      render: (value: string, record: HeaderRow) => (
        <Input
          placeholder={valuePlaceholder}
          value={value}
          onChange={(e) => handleUpdate(record.index, 'value', e.target.value)}
          size="small"
        />
      ),
    },
    {
      title: '',
      key: 'action',
      width: 40,
      render: (_: unknown, record: HeaderRow) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => handleRemove(record.index)}
        />
      ),
    },
  ];

  return (
    <div>
      <Table
        columns={columns}
        dataSource={headers.map((h, i) => ({ ...h, index: i }))}
        rowKey={(record) => String(record.index)}
        pagination={false}
        size="small"
        locale={{ emptyText }}
      />
      <Button
        type="dashed"
        onClick={handleAdd}
        block
        icon={<PlusOutlined />}
        style={{ marginTop: 8 }}
      >
        {addText}
      </Button>
    </div>
  );
};

export default HeaderEditor;

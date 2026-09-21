import { useState, useEffect, useCallback } from 'react';
import {
  Layout,
  Card,
  Select,
  Input,
  Button,
  Tabs,
  Table,
  Modal,
  Tag,
  Space,
  Typography,
  Empty,
  Popconfirm,
  Alert,
} from 'antd';
import {
  SendOutlined,
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  EditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { AxiosError } from 'axios';
import {
  Collection,
  ApiEndpoint,
  HttpMethod,
  Header,
  Environment,
  ProxyResponse,
} from '../types';
import {
  getEndpoints,
  createEndpoint,
  updateEndpoint,
  deleteEndpoint,
} from '../api/endpoints';
import { updateCollection } from '../api/collections';
import { sendRequest } from '../api/proxy';
import { resolveWithMissingVariables } from '../utils/environment';
import { mergeDefaultHeaders } from '../utils/headers';
import { tryFormatJson, isValidJson } from '../utils/json';
import HeaderEditor from './HeaderEditor';

const { Content } = Layout;
const { Option } = Select;
const { Text } = Typography;

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

const methodColors: Record<string, string> = {
  GET: '#3b82f6',
  POST: '#22c55e',
  PUT: '#f97316',
  DELETE: '#ef4444',
  PATCH: '#a855f7',
  HEAD: '#06b6d4',
  OPTIONS: '#ec4899',
};

interface RequestPanelProps {
  collectionId: string | null;
  collections: Collection[];
  activeEnvironment: Environment | null;
  initialConfig?: {
    method: HttpMethod;
    url: string;
    headers: Header[];
    body?: string;
  } | null;
  onRefreshCollections: () => void;
}

function getErrorReasons(error: unknown): string[] {
  const axiosError = error as AxiosError<{ message?: string; details?: string[] }>;
  const data = axiosError?.response?.data;
  if (data?.details && data.details.length > 0) {
    return data.details;
  }
  if (data?.message) {
    return [data.message];
  }
  if (error instanceof Error && error.message) {
    return [error.message];
  }
  return ['请求失败'];
}

const RequestPanel = ({
  collectionId,
  collections,
  activeEnvironment,
  initialConfig,
  onRefreshCollections,
}: RequestPanelProps) => {
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<Header[]>([]);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<ProxyResponse | null>(null);
  const [endpointName, setEndpointName] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);
  const [defaultModalVisible, setDefaultModalVisible] = useState(false);
  const [defaultHeadersDraft, setDefaultHeadersDraft] = useState<Header[]>([]);
  const [savingDefaults, setSavingDefaults] = useState(false);

  const activeCollection = collectionId
    ? collections.find((c) => c._id === collectionId) || null
    : null;

  useEffect(() => {
    if (collectionId) {
      fetchEndpoints(collectionId);
    } else {
      setEndpoints([]);
    }
    setSelectedEndpoint(null);
  }, [collectionId]);

  useEffect(() => {
    if (initialConfig) {
      setMethod(initialConfig.method);
      setUrl(initialConfig.url);
      setHeaders(initialConfig.headers);
      setBody(initialConfig.body || '');
      setSelectedEndpoint(null);
    }
  }, [initialConfig]);

  const fetchEndpoints = async (id: string) => {
    try {
      const data = await getEndpoints(id);
      setEndpoints(data);
    } catch {
    }
  };

  const handleSelectEndpoint = useCallback((endpoint: ApiEndpoint) => {
    setSelectedEndpoint(endpoint);
    setMethod(endpoint.method);
    setUrl(endpoint.url);
    setHeaders(endpoint.headers || []);
    setBody(endpoint.body || '');
    setResponse(null);
  }, []);

  const handleFormatBody = () => {
    setBody(tryFormatJson(body));
  };

  const resetForm = () => {
    setMethod('GET');
    setUrl('');
    setHeaders([]);
    setBody('');
    setResponse(null);
    setSelectedEndpoint(null);
    setShowNameInput(false);
    setEndpointName('');
  };

  const handleSend = async () => {
    if (!url.trim()) {
      Modal.warning({
        title: '无法发送请求',
        content: '请输入请求 URL',
      });
      return;
    }

    // 1. URL 按当前环境展开变量
    const resolvedUrlResult = resolveWithMissingVariables(url.trim(), activeEnvironment);

    // 2. 默认头与接口头按名称忽略大小写合并（同时展开变量）
    const merged = mergeDefaultHeaders(
      activeCollection?.defaultHeaders || [],
      headers,
      activeEnvironment
    );

    // 3. 汇总所有阻止原因：变量缺失、合并结果无效
    const reasons: string[] = [];
    resolvedUrlResult.missing.forEach((name) => {
      reasons.push(`URL 中变量 {{${name}}} 在当前环境缺失`);
    });
    reasons.push(...merged.errors);

    if (resolvedUrlResult.value) {
      try {
        // eslint-disable-next-line no-new
        new URL(resolvedUrlResult.value);
      } catch {
        reasons.push(`URL 不是合法地址：${resolvedUrlResult.value}`);
      }
    }

    if (reasons.length > 0) {
      Modal.error({
        title: '请求未发送',
        width: 520,
        content: (
          <div>
            <Text type="secondary">以下问题导致本次发送被阻止：</Text>
            <ul style={{ marginTop: 8, paddingLeft: 20, marginBottom: 0 }}>
              {reasons.map((reason, index) => (
                <li key={index} style={{ color: '#ff4d4f' }}>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        ),
      });
      return;
    }

    try {
      setSending(true);
      const result = await sendRequest({
        method,
        url: resolvedUrlResult.value,
        // 发送的是合并后的最终请求头；禁用项已剔除
        headers: merged.headers,
        body,
      });

      setResponse(result);
      Modal.success({
        title: '请求完成',
        width: 420,
        content: (
          <Space direction="vertical" size={4}>
            <Text>状态：{result.status}，耗时 {result.duration}ms</Text>
            {merged.removals.length > 0 && (
              <Text type="secondary">已剔除默认头：{merged.removals.join('；')}</Text>
            )}
          </Space>
        ),
        okText: '知道了',
      });
    } catch (error) {
      Modal.error({
        title: '请求未发送',
        width: 520,
        content: (
          <div>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {getErrorReasons(error).map((reason, index) => (
                <li key={index} style={{ color: '#ff4d4f' }}>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        ),
      });
    } finally {
      setSending(false);
    }
  };

  const handleSaveEndpoint = async () => {
    if (!collectionId) {
      Modal.warning({ title: '无法保存', content: '请先选择一个集合' });
      return;
    }

    if (!endpointName.trim()) {
      setShowNameInput(true);
      return;
    }

    try {
      setSaving(true);
      if (selectedEndpoint) {
        await updateEndpoint(selectedEndpoint._id, {
          name: endpointName,
          method,
          url,
          headers,
          body,
        });
      } else {
        await createEndpoint({
          collectionId,
          name: endpointName,
          method,
          url,
          headers,
          body,
        });
      }
      await fetchEndpoints(collectionId);
      setShowNameInput(false);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEndpoint = async () => {
    if (!selectedEndpoint) return;

    try {
      await deleteEndpoint(selectedEndpoint._id);
      resetForm();
      if (collectionId) {
        await fetchEndpoints(collectionId);
      }
    } catch {
    }
  };

  const handleOpenDefaultModal = () => {
    setDefaultHeadersDraft(
      (activeCollection?.defaultHeaders || []).map((h) => ({ ...h }))
    );
    setDefaultModalVisible(true);
  };

  const handleSaveDefaultHeaders = async () => {
    if (!activeCollection) return;
    // 自动剔除未填写的空行（名称与值都为空）；其余交给后端严格校验
    const cleanedHeaders = defaultHeadersDraft.filter(
      (h) => h.key.trim() !== '' || h.value.trim() !== ''
    );
    try {
      setSavingDefaults(true);
      await updateCollection(activeCollection._id, {
        defaultHeaders: cleanedHeaders,
      });
      onRefreshCollections();
      setDefaultModalVisible(false);
    } catch (error) {
      // 校验失败（名称非法 / 同名重复）时后端拒绝保存，原配置不变
      Modal.error({
        title: '默认头保存失败，原配置未修改',
        width: 520,
        content: (
          <div>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {getErrorReasons(error).map((reason, index) => (
                <li key={index} style={{ color: '#ff4d4f' }}>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        ),
      });
    } finally {
      setSavingDefaults(false);
    }
  };

  const responseTabItems = [
    {
      key: 'body',
      label: 'Body',
      children: response ? (
        <div style={{ height: 300 }}>
          <Editor
            height="100%"
            defaultLanguage="json"
            theme="vs-dark"
            value={response.body}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              wordWrap: 'on',
            }}
          />
        </div>
      ) : (
        <Empty description="发送请求后查看响应" style={{ padding: 48 }} />
      ),
    },
    {
      key: 'headers',
      label: 'Headers',
      children: response ? (
        <Table
          dataSource={Object.entries(response.headers).map(([key, value]) => ({
            key,
            value,
          }))}
          columns={[
            { title: 'Name', dataIndex: 'key', key: 'key' },
            { title: 'Value', dataIndex: 'value', key: 'value' },
          ]}
          pagination={false}
          size="small"
        />
      ) : (
        <Empty description="发送请求后查看响应头" style={{ padding: 48 }} />
      ),
    },
  ];

  const requestTabItems = [
    {
      key: 'params',
      label: 'Params',
      children: (
        <div style={{ padding: 16 }}>
          <Text type="secondary">Params 功能将在后续版本支持</Text>
        </div>
      ),
    },
    {
      key: 'headers',
      label: 'Headers',
      children: (
        <div style={{ padding: 16 }}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 8 }}
            message={
              activeCollection
                ? `继承集合「${activeCollection.name}」的 ${activeCollection.defaultHeaders?.length || 0} 个默认头；同名头（忽略大小写）在此覆盖默认头，值留空则剔除默认头，禁用项不发送。`
                : '未选择集合，本次发送不会继承任何默认头。'
            }
          />
          <HeaderEditor headers={headers} onChange={setHeaders} />
        </div>
      ),
    },
    {
      key: 'body',
      label: 'Body',
      children: (
        <div style={{ padding: 16 }}>
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="link"
              icon={<ReloadOutlined />}
              onClick={handleFormatBody}
              disabled={!isValidJson(body)}
            >
              格式化 JSON
            </Button>
          </div>
          <div style={{ height: 200 }}>
            <Editor
              height="100%"
              defaultLanguage="json"
              theme="vs-dark"
              value={body}
              onChange={(value) => setBody(value || '')}
              options={{
                minimap: { enabled: false },
                wordWrap: 'on',
                fontSize: 12,
              }}
            />
          </div>
        </div>
      ),
    },
  ];

  return (
    <Content style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', height: '100%' }}>
        <div
          style={{
            width: 240,
            borderRight: '1px solid #f0f0f0',
            padding: 16,
            overflow: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text strong>接口列表</Text>
            <Button type="text" icon={<PlusOutlined />} onClick={resetForm} />
          </div>
          {!collectionId ? (
            <Text type="secondary">请先选择一个集合</Text>
          ) : endpoints.length === 0 ? (
            <Text type="secondary">暂无接口</Text>
          ) : (
            endpoints.map((endpoint) => (
              <div
                key={endpoint._id}
                onClick={() => handleSelectEndpoint(endpoint)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background:
                    selectedEndpoint?._id === endpoint._id ? '#e6f7ff' : 'transparent',
                  marginBottom: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Tag
                  color={methodColors[endpoint.method]}
                  style={{ minWidth: 50, textAlign: 'center' }}
                >
                  {endpoint.method}
                </Tag>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {endpoint.name}
                </span>
              </div>
            ))
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Card
            style={{ border: 'none', borderRadius: 0, borderBottom: '1px solid #f0f0f0' }}
            bodyStyle={{ padding: 16 }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Select
                value={method}
                onChange={(value) => setMethod(value as HttpMethod)}
                style={{ width: 100 }}
              >
                {HTTP_METHODS.map((m) => (
                  <Option key={m} value={m}>
                    <span style={{ color: methodColors[m], fontWeight: 600 }}>{m}</span>
                  </Option>
                ))}
              </Select>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="请输入请求 URL，例如 {{base_url}}/api/users"
                style={{ flex: 1 }}
                onPressEnter={handleSend}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSend}
                loading={sending}
              >
                发送
              </Button>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {showNameInput && (
                <Input
                  value={endpointName}
                  onChange={(e) => setEndpointName(e.target.value)}
                  placeholder="请输入接口名称"
                  style={{ width: 200 }}
                />
              )}
              <Button
                icon={selectedEndpoint ? <EditOutlined /> : <SaveOutlined />}
                onClick={() => {
                  if (!showNameInput) {
                    if (selectedEndpoint) {
                      setEndpointName(selectedEndpoint.name);
                    }
                    setShowNameInput(true);
                  } else {
                    handleSaveEndpoint();
                  }
                }}
                loading={saving}
              >
                {selectedEndpoint ? '更新接口' : '保存接口'}
              </Button>
              {selectedEndpoint && (
                <Popconfirm
                  title="确认删除此接口？"
                  onConfirm={handleDeleteEndpoint}
                  okText="确认"
                  cancelText="取消"
                >
                  <Button danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>
              )}
              <Button onClick={resetForm}>重置</Button>
              <Button
                icon={<SafetyCertificateOutlined />}
                onClick={handleOpenDefaultModal}
                disabled={!activeCollection}
              >
                集合默认头{activeCollection?.defaultHeaders?.length
                  ? `（${activeCollection.defaultHeaders.length}）`
                  : ''}
              </Button>
              {activeEnvironment && (
                <Tag color="green">
                  环境: {activeEnvironment.name}
                </Tag>
              )}
            </div>
          </Card>

          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ borderBottom: '1px solid #f0f0f0' }}>
              <Tabs defaultActiveKey="headers" items={requestTabItems} />
            </div>

            {response && (
              <Card
                style={{ border: 'none', borderRadius: 0, borderTop: '1px solid #f0f0f0', margin: 0 }}
                bodyStyle={{ padding: 16 }}
                title={
                  <Space>
                    {response.status >= 200 && response.status < 300 ? (
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    ) : (
                      <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                    )}
                    <Text strong>{response.status}</Text>
                    <Text type="secondary">{response.statusText}</Text>
                    <Text type="secondary">耗时: {response.duration}ms</Text>
                  </Space>
                }
              >
                <Tabs defaultActiveKey="body" items={responseTabItems} />
              </Card>
            )}
          </div>
        </div>
      </div>

      <Modal
        title={`集合默认头 - ${activeCollection?.name || ''}`}
        open={defaultModalVisible}
        onCancel={() => setDefaultModalVisible(false)}
        onOk={handleSaveDefaultHeaders}
        confirmLoading={savingDefaults}
        okText="保存默认头"
        cancelText="取消"
        width={680}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="默认头会被集合内所有接口继承：发送时与接口头按名称忽略大小写合并；接口同名值覆盖默认值，接口同名值留空则剔除默认头，禁用项不发送。名称非法或同名重复时将无法保存。"
        />
        <HeaderEditor
          headers={defaultHeadersDraft}
          onChange={setDefaultHeadersDraft}
          keyPlaceholder="默认头 Key，如 X-Token"
          valuePlaceholder="默认头 Value，支持 {{变量}}"
          emptyText="暂无默认请求头"
          addText="添加默认头"
        />
      </Modal>
    </Content>
  );
};

export default RequestPanel;

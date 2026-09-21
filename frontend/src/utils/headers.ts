import { Header } from '../types';

// RFC 7230 token：合法的 HTTP 请求头名称
export const HEADER_NAME_REGEX = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

// 名称与值都为空白的行视为未填写，不参与校验与发送
export const isBlankHeaderRow = (header: Header): boolean =>
  header.key.trim().length === 0 && header.value.trim().length === 0;

// 校验集合默认请求头：名称必须合法，且不允许同名（忽略大小写）
export const validateDefaultHeaders = (headers: Header[]): string[] => {
  const errors: string[] = [];
  const seen = new Map<string, string>();

  headers.forEach((header, index) => {
    if (isBlankHeaderRow(header)) {
      return;
    }

    const position = `第 ${index + 1} 行`;
    const name = header.key.trim();

    if (!name) {
      errors.push(`${position}：请求头名称不能为空`);
      return;
    }

    if (!HEADER_NAME_REGEX.test(name)) {
      errors.push(`${position}：请求头名称 "${name}" 含有非法字符`);
      return;
    }

    const lowerName = name.toLowerCase();
    const existing = seen.get(lowerName);
    if (existing !== undefined) {
      errors.push(`${position}：请求头名称 "${name}" 与 "${existing}" 重复（名称不区分大小写）`);
      return;
    }
    seen.set(lowerName, name);
  });

  return errors;
};

// 清洗默认请求头：剔除空白行、修剪名称
export const sanitizeDefaultHeaders = (headers: Header[]): Header[] =>
  headers
    .filter((header) => !isBlankHeaderRow(header))
    .map((header) => ({
      key: header.key.trim(),
      value: header.value,
      enabled: header.enabled,
    }));

// 合并集合默认头与接口头（按名称忽略大小写）：
// - 接口同名且值非空 → 覆盖默认
// - 接口同名且值明确留空 → 剔除该默认头
// - 禁用项不参与发送
export const mergeHeaders = (defaultHeaders: Header[], endpointHeaders: Header[]): Header[] => {
  const merged = new Map<string, Header>();

  defaultHeaders.forEach((header) => {
    if (!header.enabled) {
      return;
    }
    const key = header.key.trim();
    if (!key) {
      return;
    }
    merged.set(key.toLowerCase(), { key, value: header.value, enabled: true });
  });

  endpointHeaders.forEach((header) => {
    if (!header.enabled) {
      return;
    }
    const key = header.key.trim();
    if (!key) {
      return;
    }
    const lowerKey = key.toLowerCase();
    if (header.value.trim().length === 0) {
      // 明确留空 → 剔除同名默认头
      merged.delete(lowerKey);
    } else {
      // 同名覆盖或新增
      merged.set(lowerKey, { key, value: header.value, enabled: true });
    }
  });

  return [...merged.values()];
};

export interface PreparedHeaders {
  headers: Header[];
  errors: string[];
}

// 合并并校验即将发出的请求头，合并结果无效时返回全部原因
export const prepareOutgoingHeaders = (
  defaultHeaders: Header[],
  endpointHeaders: Header[]
): PreparedHeaders => {
  const errors: string[] = [];

  // 接口头中"有值但无名"的行无法参与合并，视为无效
  endpointHeaders.forEach((header) => {
    if (!header.enabled) {
      return;
    }
    if (header.key.trim().length === 0 && header.value.trim().length > 0) {
      errors.push('存在未填写名称的请求头');
    }
  });

  const headers = mergeHeaders(defaultHeaders, endpointHeaders);

  headers.forEach((header) => {
    if (!HEADER_NAME_REGEX.test(header.key)) {
      errors.push(`请求头名称 "${header.key}" 含有非法字符`);
    }
    if (/[\r\n]/.test(header.value)) {
      errors.push(`请求头 "${header.key}" 的值包含非法换行字符`);
    }
  });

  return { headers, errors: [...new Set(errors)] };
};

import { HeaderItem } from '../types';

// RFC 7230 token：合法的 HTTP 请求头名称
export const HEADER_NAME_REGEX = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

// 名称与值都为空白的行视为未填写，不参与校验与发送
export const isBlankHeaderRow = (header: HeaderItem): boolean =>
  header.key.trim().length === 0 && header.value.trim().length === 0;

// 校验集合默认请求头：名称必须合法，且不允许同名（忽略大小写）
export const validateDefaultHeaders = (headers: HeaderItem[]): string[] => {
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
export const sanitizeDefaultHeaders = (headers: HeaderItem[]): HeaderItem[] =>
  headers
    .filter((header) => !isBlankHeaderRow(header))
    .map((header) => ({
      key: header.key.trim(),
      value: header.value,
      enabled: header.enabled !== false,
    }));

// 校验即将发出的请求头（合并结果）：名称合法、值不含换行
export const validateOutgoingHeaders = (headers: HeaderItem[]): string[] => {
  const errors: string[] = [];

  headers.forEach((header) => {
    if (!header.enabled || isBlankHeaderRow(header)) {
      return;
    }

    const name = header.key.trim();

    if (!name) {
      errors.push('存在未填写名称的请求头');
      return;
    }

    if (!HEADER_NAME_REGEX.test(name)) {
      errors.push(`请求头名称 "${name}" 含有非法字符`);
    }

    if (/[\r\n]/.test(header.value)) {
      errors.push(`请求头 "${name}" 的值包含非法换行字符`);
    }
  });

  return [...new Set(errors)];
};

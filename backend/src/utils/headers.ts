import { HeaderItem } from '../types';

// RFC 7230 token：合法的 HTTP 头字段名只能由以下可见 ASCII 字符组成
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function isValidHeaderName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return HEADER_NAME_PATTERN.test(trimmed);
}

function isHeaderItem(item: unknown): item is HeaderItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as HeaderItem).key === 'string' &&
    typeof (item as HeaderItem).value === 'string'
  );
}

/**
 * 校验一组请求头：结构合法、名称合法、名称（忽略大小写）不重复。
 * 返回所有错误原因，空数组表示通过。
 */
export function validateHeaders(
  headers: unknown,
  label: string
): { valid: boolean; normalized: HeaderItem[]; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(headers)) {
    return { valid: false, normalized: [], errors: [`${label}格式不合法`] };
  }

  const normalized: HeaderItem[] = headers.map((item, index) => {
    if (!isHeaderItem(item)) {
      errors.push(`${label}第 ${index + 1} 行格式不合法`);
      return { key: '', value: '', enabled: true };
    }
    return {
      key: item.key.trim(),
      value: item.value,
      enabled: item.enabled !== false,
    };
  });

  if (errors.length > 0) {
    return { valid: false, normalized, errors };
  }

  const seen = new Set<string>();
  normalized.forEach((header, index) => {
    if (header.key.length === 0) {
      errors.push(`${label}第 ${index + 1} 行名称不能为空`);
      return;
    }
    if (!isValidHeaderName(header.key)) {
      errors.push(`${label}名称不合法：${header.key}`);
      return;
    }
    const lowerName = header.key.toLowerCase();
    if (seen.has(lowerName)) {
      errors.push(`${label}存在同名（忽略大小写）请求头：${header.key}`);
      return;
    }
    seen.add(lowerName);
  });

  return { valid: errors.length === 0, normalized, errors };
}

import { Header, Environment } from '../types';
import { resolveWithMissingVariables } from './environment';

// 与后端一致的 RFC 7230 token 规则
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export interface MergeResult {
  /** 合并、展开、剔除后，最终实际会发送的请求头 */
  headers: Header[];
  /** 阻止发送的全部原因（变量缺失、名称非法、明确留空剔除等提示除外） */
  errors: string[];
  /** 明确留空而被剔除的默认头提示（不阻止发送） */
  removals: string[];
}

interface ResolvedEntry {
  key: string;
  value: string;
  enabled: boolean;
}

/**
 * 发送集合内接口时：按当前环境展开变量，将集合默认头与接口头按名称忽略大小写合并。
 * 规则：
 * - 禁用的默认头 / 接口头都不发送；
 * - 接口同名（忽略大小写）启用头覆盖默认头的值；
 * - 接口同名头值明确留空时，剔除对应默认头；
 * - 变量缺失或合并结果（名称）无效时，通过 errors 列出全部原因。
 */
export function mergeDefaultHeaders(
  defaultHeaders: Header[],
  endpointHeaders: Header[],
  environment: Environment | null
): MergeResult {
  const errors: string[] = [];
  const removals: string[] = [];
  const map = new Map<string, ResolvedEntry>();

  // 1. 先放入启用的默认头（按当前环境展开变量）
  defaultHeaders.forEach((header) => {
    if (!header.enabled) {
      return;
    }
    const resolvedKey = resolveWithMissingVariables(header.key ?? '', environment);
    const resolvedValue = resolveWithMissingVariables(header.value ?? '', environment);

    resolvedKey.missing.forEach((name) => {
      errors.push(`默认头「${header.key}」名称中变量 {{${name}}} 在当前环境缺失`);
    });
    resolvedValue.missing.forEach((name) => {
      errors.push(`默认头「${header.key}」的值中变量 {{${name}}} 在当前环境缺失`);
    });

    const key = resolvedKey.value.trim();
    const value = resolvedValue.value;
    if (!key) {
      errors.push('默认头名称不能为空');
      return;
    }
    if (!HEADER_NAME_PATTERN.test(key)) {
      errors.push(`默认头名称不合法：${key}`);
      return;
    }

    // 启用但值明确留空：默认头自身即不产生发送项
    if (value === '') {
      removals.push(`默认头「${key}」值为空，已剔除`);
      return;
    }

    map.set(key.toLowerCase(), { key, value, enabled: true });
  });

  // 2. 再应用接口头（覆盖 / 剔除）
  endpointHeaders.forEach((header) => {
    if (!header.enabled) {
      return;
    }
    const trimmedRawKey = (header.key ?? '').trim();
    if (trimmedRawKey === '') {
      // 接口编辑中尚未填写名称的空行，直接忽略
      return;
    }

    const resolvedKey = resolveWithMissingVariables(header.key ?? '', environment);
    const resolvedValue = resolveWithMissingVariables(header.value ?? '', environment);

    resolvedKey.missing.forEach((name) => {
      errors.push(`接口头「${header.key}」名称中变量 {{${name}}} 在当前环境缺失`);
    });
    resolvedValue.missing.forEach((name) => {
      errors.push(`接口头「${header.key}」的值中变量 {{${name}}} 在当前环境缺失`);
    });

    const key = resolvedKey.value.trim();
    const value = resolvedValue.value;
    if (!HEADER_NAME_PATTERN.test(key)) {
      errors.push(`请求头名称不合法：${key}`);
      return;
    }

    const lower = key.toLowerCase();
    const existing = map.get(lower);

    if (value === '') {
      // 明确留空：同名默认头被剔除；接口自身也不新增
      if (existing) {
        map.delete(lower);
        removals.push(`接口头「${existing.key}」值留空，已剔除该默认头`);
      }
      return;
    }

    if (existing) {
      existing.value = value;
      existing.key = key;
    } else {
      map.set(lower, { key, value, enabled: true });
    }
  });

  const headers: Header[] = [];
  map.forEach((entry) => {
    if (entry.enabled) {
      headers.push({ key: entry.key, value: entry.value, enabled: true });
    }
  });

  return { headers, errors, removals };
}

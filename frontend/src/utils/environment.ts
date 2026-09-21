import { Environment, EnvVariable } from '../types';

export const replaceEnvVariables = (
  text: string,
  environment: Environment | null
): string => {
  if (!environment || !environment.variables) {
    return text;
  }

  let result = text;
  environment.variables.forEach((variable: EnvVariable) => {
    const pattern = new RegExp(`\\{\\{${variable.key}\\}\\}`, 'g');
    result = result.replace(pattern, variable.value);
  });

  return result;
};

export const extractEnvVariables = (text: string): string[] => {
  const regex = /\{\{([^}]+)\}\}/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (!matches.includes(match[1] as string)) {
      matches.push(match[1] as string);
    }
  }

  return matches;
};

/**
 * 按当前环境展开变量，并列出展开后仍残留的 {{变量名}}（即当前环境缺失的变量）。
 */
export const resolveWithMissingVariables = (
  text: string,
  environment: Environment | null
): { value: string; missing: string[] } => {
  const value = replaceEnvVariables(text, environment);
  const missing: string[] = [];
  const regex = /\{\{\s*([^}]+?)\s*\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value)) !== null) {
    const name = (match[1] as string).trim();
    if (name && !missing.includes(name)) {
      missing.push(name);
    }
  }

  return { value, missing };
};

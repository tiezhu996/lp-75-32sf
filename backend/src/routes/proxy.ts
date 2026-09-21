import { Router, Response } from 'express';
import authMiddleware from '../middleware/auth';
import RequestHistory from '../models/RequestHistory';
import { AuthenticatedRequest, ApiResponse, ProxyRequestData } from '../types';
import { proxyRequest } from '../utils/proxy';
import { validateHeaders } from '../utils/headers';
import { MAX_HISTORY_PER_USER } from './history';

const router = Router();

const UNRESOLVED_VAR_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

function findUnresolvedVariables(text: string | undefined): string[] {
  if (!text) {
    return [];
  }
  const missing: string[] = [];
  let match: RegExpExecArray | null;
  UNRESOLVED_VAR_PATTERN.lastIndex = 0;
  while ((match = UNRESOLVED_VAR_PATTERN.exec(text)) !== null) {
    const name = (match[1] as string).trim();
    if (name && !missing.includes(name)) {
      missing.push(name);
    }
  }
  return missing;
}

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未授权访问' });
      return;
    }

    const { method, url, headers, body } = req.body as ProxyRequestData;

    if (!method || !url) {
      res.status(400).json({
        success: false,
        message: '缺少必要参数',
      });
      return;
    }

    const reasons: string[] = [];

    // 最终请求头（默认头与接口头合并后的结果）必须合法，否则整次发送阻止
    const headerCheck = validateHeaders(headers ?? [], '请求头');
    if (!headerCheck.valid) {
      reasons.push(...headerCheck.errors);
    }

    // 未展开的环境变量（前端已拦截，这里做服务端兜底）
    // 使用校验归一化后的请求头；非数组时为安全的空数组，结构错误已在上面收集
    findUnresolvedVariables(url).forEach((name) => {
      reasons.push(`URL 中变量未展开：{{${name}}}`);
    });
    headerCheck.normalized.forEach((header) => {
      findUnresolvedVariables(header.key).forEach((name) => {
        reasons.push(`请求头 ${header.key} 名称中变量未展开：{{${name}}}`);
      });
      findUnresolvedVariables(header.value).forEach((name) => {
        reasons.push(`请求头 ${header.key} 的值中变量未展开：{{${name}}}`);
      });
    });

    if (reasons.length > 0) {
      res.status(400).json({
        success: false,
        message: '请求校验未通过，请求未发送',
        details: reasons,
      });
      return;
    }

    const finalHeaders = headerCheck.normalized;

    const response = await proxyRequest({ method, url, headers: finalHeaders, body });

    // 历史按实际发出的请求（合并、展开、剔除后的最终结果）回填
    const history = new RequestHistory({
      userId: req.user._id,
      method,
      url,
      headers: finalHeaders,
      body,
      response,
    });

    await history.save();

    const historyCount = await RequestHistory.countDocuments({ userId: req.user._id });

    if (historyCount > MAX_HISTORY_PER_USER) {
      const oldestRecords = await RequestHistory.find({ userId: req.user._id })
        .sort({ createdAt: 1 })
        .limit(historyCount - MAX_HISTORY_PER_USER);

      const idsToDelete = oldestRecords.map((record) => record._id);
      await RequestHistory.deleteMany({ _id: { $in: idsToDelete } });
    }

    res.json({
      success: true,
      data: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: response.body,
        duration: response.duration,
        historyId: history._id.toString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '代理请求失败',
    });
  }
});

export default router;

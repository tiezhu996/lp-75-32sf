import { Router, Response } from 'express';
import authMiddleware from '../middleware/auth';
import RequestHistory from '../models/RequestHistory';
import { AuthenticatedRequest, ApiResponse, ProxyRequestData, HeaderItem } from '../types';
import { proxyRequest } from '../utils/proxy';
import { validateOutgoingHeaders } from '../utils/headers';
import { MAX_HISTORY_PER_USER } from './history';

const router = Router();

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

    // 规范化请求头，仅启用且已命名的项会真正发出
    const headerList: HeaderItem[] = Array.isArray(headers)
      ? headers.map((item) => {
          const raw = (item ?? {}) as unknown as Record<string, unknown>;
          return {
            key: typeof raw.key === 'string' ? raw.key : '',
            value: typeof raw.value === 'string' ? raw.value : '',
            enabled: raw.enabled !== false,
          };
        })
      : [];

    const enabledHeaders = headerList.filter((header) => header.enabled);

    // 合并结果无效时阻止整次发送并列出原因
    const headerErrors = validateOutgoingHeaders(enabledHeaders);
    if (headerErrors.length > 0) {
      res.status(400).json({
        success: false,
        message: `请求已阻止：${headerErrors.join('；')}`,
      });
      return;
    }

    const outgoingHeaders = enabledHeaders
      .filter((header) => header.key.trim().length > 0)
      .map((header) => ({ ...header, key: header.key.trim() }));

    const response = await proxyRequest({ method, url, headers: outgoingHeaders, body });

    // 历史按实际发出的请求回填
    const history = new RequestHistory({
      userId: req.user._id,
      method,
      url,
      headers: outgoingHeaders,
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

import { Router, Response } from 'express';
import authMiddleware from '../middleware/auth';
import Collection from '../models/Collection';
import ApiEndpoint, { IHeader } from '../models/ApiEndpoint';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { sanitizeDefaultHeaders, validateDefaultHeaders } from '../utils/headers';
import mongoose from 'mongoose';

const router = Router();

interface CreateCollectionRequest {
  name: string;
  description?: string;
  defaultHeaders?: IHeader[];
}

interface UpdateCollectionRequest {
  name?: string;
  description?: string;
  defaultHeaders?: IHeader[];
}

const normalizeHeaders = (input: unknown): IHeader[] => {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.map((item) => {
    const raw = (item ?? {}) as Record<string, unknown>;
    return {
      key: typeof raw.key === 'string' ? raw.key : '',
      value: typeof raw.value === 'string' ? raw.value : '',
      enabled: raw.enabled !== false,
    };
  });
};

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未授权访问' });
      return;
    }

    const collections = await Collection.find({ userId: req.user._id }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      data: collections,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取集合列表失败',
    });
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未授权访问' });
      return;
    }

    const { name, description, defaultHeaders } = req.body as CreateCollectionRequest;

    if (!name || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: '集合名称不能为空',
      });
      return;
    }

    // 默认请求头名称非法或同名重复时拒绝保存
    let sanitizedDefaultHeaders: IHeader[] = [];
    if (defaultHeaders !== undefined) {
      const headerErrors = validateDefaultHeaders(normalizeHeaders(defaultHeaders));
      if (headerErrors.length > 0) {
        res.status(400).json({
          success: false,
          message: `默认请求头保存失败：${headerErrors.join('；')}`,
        });
        return;
      }
      sanitizedDefaultHeaders = sanitizeDefaultHeaders(normalizeHeaders(defaultHeaders));
    }

    const existingCollection = await Collection.findOne({
      userId: req.user._id,
      name: name.trim(),
    });

    if (existingCollection) {
      res.status(400).json({
        success: false,
        message: '集合名称已存在',
      });
      return;
    }

    const collection = new Collection({
      userId: req.user._id,
      name: name.trim(),
      description: description?.trim(),
      defaultHeaders: sanitizedDefaultHeaders,
    });

    await collection.save();

    res.status(201).json({
      success: true,
      data: collection,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '创建集合失败',
    });
  }
});

router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未授权访问' });
      return;
    }

    const { id } = req.params;
    const { name, description, defaultHeaders } = req.body as UpdateCollectionRequest;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: '无效的集合 ID',
      });
      return;
    }

    // 先校验默认请求头，非法或同名重复时拒绝保存，原配置不变
    let sanitizedDefaultHeaders: IHeader[] | undefined;
    if (defaultHeaders !== undefined) {
      const headerErrors = validateDefaultHeaders(normalizeHeaders(defaultHeaders));
      if (headerErrors.length > 0) {
        res.status(400).json({
          success: false,
          message: `默认请求头保存失败：${headerErrors.join('；')}`,
        });
        return;
      }
      sanitizedDefaultHeaders = sanitizeDefaultHeaders(normalizeHeaders(defaultHeaders));
    }

    const collection = await Collection.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!collection) {
      res.status(404).json({
        success: false,
        message: '集合不存在',
      });
      return;
    }

    if (name && name.trim().length > 0) {
      const existingCollection = await Collection.findOne({
        userId: req.user._id,
        name: name.trim(),
        _id: { $ne: id },
      });

      if (existingCollection) {
        res.status(400).json({
          success: false,
          message: '集合名称已存在',
        });
        return;
      }

      collection.name = name.trim();
    }

    if (description !== undefined) {
      collection.description = description?.trim();
    }

    if (sanitizedDefaultHeaders !== undefined) {
      collection.defaultHeaders = sanitizedDefaultHeaders;
    }

    await collection.save();

    res.json({
      success: true,
      data: collection,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '更新集合失败',
    });
  }
});

router.delete(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: '未授权访问' });
        return;
      }

      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({
          success: false,
          message: '无效的集合 ID',
        });
        return;
      }

      const collection = await Collection.findOne({
        _id: id,
        userId: req.user._id,
      });

      if (!collection) {
        res.status(404).json({
          success: false,
          message: '集合不存在',
        });
        return;
      }

      await ApiEndpoint.deleteMany({ collectionId: id, userId: req.user._id });
      await collection.deleteOne();

      res.json({
        success: true,
        message: '集合已删除',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: '删除集合失败',
      });
    }
  }
);

export default router;

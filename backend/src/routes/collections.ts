import { Router, Response } from 'express';
import authMiddleware from '../middleware/auth';
import Collection, { IDefaultHeader } from '../models/Collection';
import ApiEndpoint from '../models/ApiEndpoint';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { validateHeaders } from '../utils/headers';
import mongoose from 'mongoose';

const router = Router();

interface CreateCollectionRequest {
  name: string;
  description?: string;
  defaultHeaders?: IDefaultHeader[];
}

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

    const headersToValidate = defaultHeaders ?? [];
    const headerCheck = validateHeaders(headersToValidate, '默认请求头');
    if (!headerCheck.valid) {
      res.status(400).json({
        success: false,
        message: '默认请求头校验失败，集合未保存',
        details: headerCheck.errors,
      });
      return;
    }

    const collection = new Collection({
      userId: req.user._id,
      name: name.trim(),
      description: description?.trim(),
      defaultHeaders: headerCheck.normalized,
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
    const { name, description, defaultHeaders } = req.body as CreateCollectionRequest;

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

    // 先校验再赋值，校验失败时不改动任何字段，原配置保持不变
    if (defaultHeaders !== undefined) {
      const headerCheck = validateHeaders(defaultHeaders, '默认请求头');
      if (!headerCheck.valid) {
        res.status(400).json({
          success: false,
          message: '默认请求头校验失败，原配置未修改',
          details: headerCheck.errors,
        });
        return;
      }
      collection.defaultHeaders = headerCheck.normalized;
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

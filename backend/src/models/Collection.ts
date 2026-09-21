import mongoose, { Schema, Document } from 'mongoose';

export interface IDefaultHeader {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ICollection extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  defaultHeaders: IDefaultHeader[];
  createdAt: Date;
  updatedAt: Date;
}

const CollectionSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    defaultHeaders: [
      {
        _id: false,
        key: { type: String, trim: true },
        value: { type: String },
        enabled: { type: Boolean, default: true },
      },
    ],
  },
  {
    timestamps: true,
  }
);

CollectionSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model<ICollection>('Collection', CollectionSchema);

import mongoose, { Schema, Document } from 'mongoose';
import { IHeader } from './ApiEndpoint';

export interface ICollection extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  defaultHeaders: IHeader[];
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
        key: { type: String, trim: true },
        value: { type: String, trim: true },
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

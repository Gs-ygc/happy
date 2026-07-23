import type { Metadata } from '@/api/types';
import type { CodexModel } from '../codexAppServerTypes';

type MetadataModels = NonNullable<Metadata['models']>;

export function toMetadataModels(models: CodexModel[]): MetadataModels {
    return models
        .filter((model) => !model.hidden)
        .map((model) => ({
            code: model.id,
            value: model.displayName || model.id,
            description: model.description || null,
        }));
}

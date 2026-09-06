import { createUsePuck } from '@puckeditor/core';
import type { Config, Data } from '@puckeditor/core';
import type { Components } from './config';
import type { RootProps } from './transform';

export type ComposerConfig = Config<{ components: Components; root: RootProps }>;
export type ComposerData = Data<Components, RootProps>;

/** A typed selector hook over Puck's store, so panels and fields can read the current data. */
export const usePuckStore = createUsePuck<ComposerConfig>();

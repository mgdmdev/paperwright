export { gemini, openAiCompatible, scripted } from './client';
export type { LlmClient, CompletionRequest, Message, GeminiOptions, OpenAiCompatibleOptions } from './client';
export { generateTemplate, editTemplate, suggestSampleData, GenerationError } from './generate';
export type { GenerateOptions, GenerateResult, EditOptions, SampleDataOptions, SampleDataResult, AssetHint } from './generate';
export { templateJsonSchema, AUTHORING_GUIDE } from './guide';
export { extractJson } from './json';
export { dataPaths } from './paths';

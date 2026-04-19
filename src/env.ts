export const expressPort = process.env.PORT || 5002;
export const ollamaPort = 11434;
export const OLLAMA_MODEL = 'llama3';
export const EMBEDDING_MODEL = 'mxbai-embed-large';

export const ollamaHost = `http://127.0.0.1:${ollamaPort}`;
export const serverHost = `http://localhost:${expressPort}`;

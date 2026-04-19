import stopwords from 'stopwords-iso';

/**
 * Professional stop-word list fetched from the industry-standard 'stopwords-iso' library.
 * This contains ~1,298 English stop-words, providing a comprehensive filter 
 * for improved retrieval precision in the RAG pipeline.
 */
export const STOP_WORDS = new Set(stopwords.en);

// Replace execute with your RAG function, agent runtime, or provider SDK call.
// Node 22+ runs this module without a TypeScript loader.
export const target = {
  name: 'local-function',
  revision: 'demo-1',
  async execute({ input }, { signal }) {
    signal.throwIfAborted();
    return { answer: String(input.question ?? ''), data: { price: 450 }, toolCalls: [] };
  },
};

// Custom evaluators receive expected data through the test case; targets do not.
// Add evaluator plugins here when JSON-pointer assertions are insufficient.
export const evaluators = [];

// A judge may use any provider SDK. It must return {score: 0..1, reason: string}.
// Use an independent, calibrated judge and version the rubric in the suite.

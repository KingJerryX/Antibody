// Shared demo counters. ponytail: module-global, in-memory; resets on restart. Fine for a demo,
// and good enough to show "no rate limit => runaway AI spend" climbing live.

const g = globalThis as unknown as { __notenest?: { aiSpend: number; chatCalls: number } };
g.__notenest ??= { aiSpend: 0, chatCalls: 0 };

export const state = g.__notenest;

// Each fake LLM call "costs" ~2 cents.
export const COST_PER_CALL = 0.02;

export function chargeChat(): { aiSpend: number; chatCalls: number } {
  state.chatCalls += 1;
  state.aiSpend = Math.round((state.aiSpend + COST_PER_CALL) * 100) / 100;
  return { ...state };
}

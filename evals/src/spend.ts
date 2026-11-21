import type { Api, Model } from '@earendil-works/pi-ai';

export type AttemptCost = {
  costUsd: number | null;
  budgetCostUsd?: number;
  judgeCostUsd?: number | null;
  modelCalls?: number;
  tokens?: number;
  judgeTokens?: number;
};

const scale = 1_000_000;
export const validCost = (cost: number | null | undefined): cost is number =>
  typeof cost === 'number' && Number.isFinite(cost) && cost >= 0;
const units = (cost: number) => Math.ceil(cost * scale);
const budgetCost = (attempt: AttemptCost) => attempt.budgetCostUsd ?? attempt.costUsd;

export function estimateAnthropicRequestUsd(
  model: Model<Api>,
  body: RequestInit['body'],
): number | null {
  if (typeof body !== 'string') return null;
  try {
    const payload = JSON.parse(body);
    if (
      payload.model !== model.id ||
      !Number.isSafeInteger(payload.max_tokens) ||
      payload.max_tokens <= 0 ||
      (payload.speed != null && payload.speed !== 'standard') ||
      payload.thread ||
      payload.tools?.length
    )
      return null;
    const inputTokens = Buffer.byteLength(body) * 2;
    const rates = [
      model.cost,
      ...(model.cost.tiers ?? []).filter((tier) => inputTokens > tier.inputTokensAbove),
    ];
    const totals = rates.map((rate) => {
      if (![rate.input, rate.output, rate.cacheRead, rate.cacheWrite].every(validCost)) return null;
      const inputRate = Math.max(rate.input * 2, rate.cacheRead, rate.cacheWrite);
      return (inputTokens * inputRate + payload.max_tokens * rate.output) / scale;
    });
    if (!totals.every(validCost)) return null;
    const maximum = Math.max(...totals) * 1.1;
    return validCost(maximum) && maximum > 0 ? maximum : null;
  } catch {
    return null;
  }
}

export function sumBudgetCosts(prices: number[]) {
  return prices.reduce((total, price) => total + units(price), 0) / scale;
}

export function createSpend() {
  let knownUnits = 0;
  let unpriced = false;
  return {
    add(attempt: AttemptCost) {
      const modelCost = budgetCost(attempt);
      if (validCost(modelCost)) knownUnits += units(modelCost);
      else if ((attempt.modelCalls ?? 0) > 0 || modelCost != null) unpriced = true;
      if (validCost(attempt.judgeCostUsd)) knownUnits += units(attempt.judgeCostUsd);
      else if ((attempt.judgeTokens ?? 0) > 0 || attempt.judgeCostUsd != null) unpriced = true;
    },
    blocked(budget?: number) {
      return budget !== undefined && (unpriced || knownUnits >= units(budget));
    },
    countedCostUsd: () => knownUnits / scale,
    unpriced: () => unpriced,
  };
}

export function mergeAttemptCosts<T extends AttemptCost>(attempts: T[]) {
  const { budgetCostUsd: _, ...last } = attempts.at(-1)!;
  const sum = (
    price: (attempt: T) => number | null | undefined,
    count: (attempt: T) => number | undefined,
  ) => {
    let total = 0;
    for (const attempt of attempts) {
      const value = price(attempt);
      if (validCost(value)) total += units(value);
      else if (count(attempt) !== 0 || value != null) return null;
    }
    return total / scale;
  };
  const modelCalls = (attempt: T) => attempt.modelCalls;
  const costUsd = sum((attempt) => attempt.costUsd, modelCalls);
  const budgetCostUsd = costUsd === null ? sum(budgetCost, modelCalls) : null;
  return {
    ...last,
    costUsd,
    ...(budgetCostUsd !== null ? { budgetCostUsd } : {}),
    judgeCostUsd: sum(
      (attempt) => attempt.judgeCostUsd,
      (attempt) => attempt.judgeTokens,
    ),
    modelCalls: attempts.reduce((sum, attempt) => sum + (attempt.modelCalls ?? 0), 0),
    tokens: attempts.reduce((sum, attempt) => sum + (attempt.tokens ?? 0), 0),
    judgeTokens: attempts.reduce((sum, attempt) => sum + (attempt.judgeTokens ?? 0), 0),
  };
}

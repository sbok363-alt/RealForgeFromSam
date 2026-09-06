export interface ToolCallDecision {
  allowed: boolean;
  reason?: 'MAX_TOTAL_CALLS_EXCEEDED' | 'MAX_IDENTICAL_CALLS_EXCEEDED' | 'OSCILLATION_DETECTED';
  message?: string;
}

export interface ToolLoopGuardOptions {
  maxTotalCalls?: number;
  maxIdenticalCalls?: number;
  maxIterations?: number;
}

export class ToolLoopGuard {
  private maxTotalCalls: number;
  private maxIdenticalCalls: number;
  private totalCallsCount: number = 0;
  private callSignatures: Map<string, number> = new Map();
  private callHistory: string[] = [];

  constructor(
    configOrMaxTotal: number | ToolLoopGuardOptions = 20,
    maxIdenticalCalls: number = 3
  ) {
    if (typeof configOrMaxTotal === 'object' && configOrMaxTotal !== null) {
      this.maxTotalCalls = configOrMaxTotal.maxTotalCalls || configOrMaxTotal.maxIterations || 20;
      this.maxIdenticalCalls = configOrMaxTotal.maxIdenticalCalls || 3;
    } else {
      this.maxTotalCalls = typeof configOrMaxTotal === 'number' ? configOrMaxTotal : 20;
      this.maxIdenticalCalls = maxIdenticalCalls;
    }
  }

  private normalizeValue(val: any): any {
    if (val === null || val === undefined) return null;
    if (typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(item => this.normalizeValue(item));
    const sortedKeys = Object.keys(val).sort();
    const result: Record<string, any> = {};
    for (const k of sortedKeys) {
      result[k] = this.normalizeValue(val[k]);
    }
    return result;
  }

  public getSignature(toolName: string, args: any): string {
    const normalizedArgs = this.normalizeValue(args || {});
    return `${toolName}:${JSON.stringify(normalizedArgs)}`;
  }

  public recordCall(toolName: string, args: any): ToolCallDecision {
    if (this.totalCallsCount >= this.maxTotalCalls) {
      return {
        allowed: false,
        reason: 'MAX_TOTAL_CALLS_EXCEEDED',
        message: `Total tool call limit of ${this.maxTotalCalls} exceeded.`
      };
    }

    const sig = this.getSignature(toolName, args);
    const prevCount = this.callSignatures.get(sig) || 0;

    if (prevCount >= this.maxIdenticalCalls) {
      return {
        allowed: false,
        reason: 'MAX_IDENTICAL_CALLS_EXCEEDED',
        message: `Repeated identical tool call limit of ${this.maxIdenticalCalls} exceeded for ${toolName}.`
      };
    }

    // Check for cyclic oscillation (e.g. A, B, A, B)
    if (this.callHistory.length >= 3) {
      const len = this.callHistory.length;
      // If history ends in [A, B, A] and next is B -> A->B oscillation
      if (
        this.callHistory[len - 2] === sig &&
        this.callHistory[len - 1] === this.callHistory[len - 3]
      ) {
        return {
          allowed: false,
          reason: 'OSCILLATION_DETECTED',
          message: `Cyclic tool call oscillation detected between ${this.callHistory[len - 1]} and ${sig}.`
        };
      }
    }

    this.totalCallsCount++;
    this.callSignatures.set(sig, prevCount + 1);
    this.callHistory.push(sig);

    return { allowed: true };
  }

  public getTotalCalls(): number {
    return this.totalCallsCount;
  }

  public getCallCountFor(toolName: string, args: any): number {
    const sig = this.getSignature(toolName, args);
    return this.callSignatures.get(sig) || 0;
  }

  public reset(): void {
    this.totalCallsCount = 0;
    this.callSignatures.clear();
    this.callHistory = [];
  }
}

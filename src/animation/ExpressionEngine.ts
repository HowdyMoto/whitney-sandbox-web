import { compile, evaluate } from 'mathjs';

// Create shared scope with custom functions
const createScope = (vars: Record<string, number> = {}) => ({
  ...vars,
  pi: () => Math.PI,
  two_pi: () => Math.PI * 2,
  pow: (base: number, exp: number) => Math.pow(base, exp),
  fmod: (a: number, b: number) => a - Math.floor(a / b) * b,
  if: (cond: number, a: number, b: number) => cond ? a : b,
});

export interface CompiledExpression {
  exprStr: string;
}

export function compileExpression(exprStr: string): CompiledExpression | null {
  if (!exprStr) return null;
  try {
    // Validate the expression can be parsed
    compile(exprStr);
    return { exprStr };
  } catch (e) {
    console.warn(`Failed to compile expression: "${exprStr}"`, e);
    return null;
  }
}

export function evaluateExpression(compiled: CompiledExpression, vars: Record<string, number>): number {
  const scope = createScope(vars);
  return evaluate(compiled.exprStr, scope) as number;
}

// Evaluate a simple constant expression (no variables)
export function evaluateConstant(exprStr: string): number | null {
  try {
    const scope = createScope();
    return evaluate(exprStr, scope) as number;
  } catch {
    return null;
  }
}

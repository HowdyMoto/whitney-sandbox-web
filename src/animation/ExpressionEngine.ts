import { Parser, type Expression } from 'expr-eval';

// Singleton parser with custom functions matching tinyexpr builtins
const parser = new Parser();

// Register custom functions that tinyexpr provides
parser.functions.pi = function () { return Math.PI; };
parser.functions.two_pi = function () { return Math.PI * 2; };
parser.functions.fmod = function (a: number, b: number) {
  // Match C fmod: result has same sign as a
  return a - Math.floor(a / b) * b;
};

// tinyexpr's if(cond, then, else) — used in rainbow.toml
// expr-eval has ternary (a ? b : c) but the TOML modes use if() function syntax
parser.functions.if = function (cond: number, a: number, b: number) {
  return cond ? a : b;
};

export interface CompiledExpression {
  expr: Expression;
}

export function compileExpression(exprStr: string): CompiledExpression | null {
  if (!exprStr) return null;
  try {
    const expr = parser.parse(exprStr);
    return { expr };
  } catch (e) {
    console.warn(`Failed to compile expression: "${exprStr}"`, e);
    return null;
  }
}

export function evaluateExpression(compiled: CompiledExpression, vars: Record<string, number>): number {
  return compiled.expr.evaluate(vars);
}

// Evaluate a simple constant expression (no variables)
export function evaluateConstant(exprStr: string): number | null {
  try {
    const expr = parser.parse(exprStr);
    return expr.evaluate({});
  } catch {
    return null;
  }
}

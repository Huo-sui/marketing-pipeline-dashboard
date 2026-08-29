export class ValidationError extends Error {
  readonly code = "VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("请求体必须是 JSON 对象");
  return value as Record<string, unknown>;
}

export function requiredString(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== "string" || !value.trim()) throw new ValidationError(`${field} 不能为空`);
  const result = value.trim();
  if (result.length > maxLength) throw new ValidationError(`${field} 长度不能超过 ${maxLength}`);
  return result;
}

export function optionalString(value: unknown, field: string, maxLength = 500): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(value, field, maxLength);
}

export function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new ValidationError(`${field} 必须是字符串数组`);
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

export function numberInput(value: unknown, field: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new ValidationError(`${field} 数值无效`);
  return value;
}

export function uuidParam(value: string | undefined, field: string): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new ValidationError(`${field} 必须是 UUID`);
  return value;
}

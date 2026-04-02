import axios from 'axios';

export interface IRulesServiceErrorType {
  message: string;
  code?: string;
  statusCode?: number;
}

/**
 * Class for handling errors from the rules service
 */
export class RulesServiceError extends Error implements IRulesServiceErrorType {
  public code: string | undefined;
  public statusCode?: number;

  constructor(message: string, code?: string, statusCode?: number) {
    super(message);
    this.name = 'RulesServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function readRulesServiceErrorPayload(data: object): {
  message?: string;
  code?: string;
} | null {
  const d = data as Record<string, unknown>;
  if (d.status !== 'error' || d.error == null || typeof d.error !== 'object') {
    return null;
  }
  const errObj = d.error as Record<string, unknown>;
  const message =
    typeof errObj.message === 'string' ? errObj.message : undefined;
  const code = typeof errObj.code === 'string' ? errObj.code : undefined;
  return { message, code };
}

export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.data && typeof error.response.data === 'object') {
      const payload = readRulesServiceErrorPayload(error.response.data);
      if (payload?.message) {
        return payload.message;
      }
    }
    if (error.response?.statusText) {
      return error.response.statusText;
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
}

export function extractErrorCode(error: unknown): string | undefined {
  if (axios.isAxiosError(error)) {
    if (error.response?.data && typeof error.response.data === 'object') {
      const payload = readRulesServiceErrorPayload(error.response.data);
      if (payload?.code) {
        return payload.code;
      }
    }
  }
  return undefined;
}

export function extractErrorInfo(error: unknown): IRulesServiceErrorType {
  const message = extractErrorMessage(error);
  const code = extractErrorCode(error);
  const statusCode = axios.isAxiosError(error)
    ? error.response?.status
    : undefined;

  return { message, code, statusCode };
}

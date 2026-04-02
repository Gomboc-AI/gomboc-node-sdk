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

export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.data && typeof error.response.data === 'object') {
      const data = error.response.data as any;
      if (data.status === 'error' && data.error?.message) {
        return data.error.message;
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
      const data = error.response.data as any;
      if (data.status === 'error' && data.error?.code) {
        return data.error.code;
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

// Thrown from Service functions, caught and converted to a Response by toErrorResponse()
// (./response.ts) at the API Route boundary.
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

// The catalogue below is DEV-04 §4's error_code table, one class per row. A Service that needs a
// code not listed there is describing a new failure mode — add the row first, then the class.
export class BadRequestError extends AppError {
  constructor(message = "リクエストが不正です。") {
    super(message, 400, "BAD_REQUEST");
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "認証が必要です。") {
    super(message, 401, "UNAUTHENTICATED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "権限がありません。") {
    super(message, 403, "FORBIDDEN");
  }
}

export class RateLimitError extends AppError {
  constructor(message = "試行回数が上限を超えました。しばらく待ってからやり直してください。") {
    super(message, 429, "RATE_LIMIT_EXCEEDED");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "リソースが見つかりません。") {
    super(message, 404, "NOT_FOUND");
  }
}

// The state machine's own 409 is InvalidStateTransitionError below. This one is for a conflict the
// status column does not describe — a slot that filled up between the read and the write.
export class ConflictError extends AppError {
  constructor(message = "この操作は現在のリソースの状態と矛盾しています。") {
    super(message, 409, "CONFLICT");
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(entity: string, from: string, to: string) {
    super(`${entity} の状態を ${from} から ${to} へ遷移できません。`, 409, "INVALID_STATE_TRANSITION");
  }
}

// An upstream (Stripe, Google Maps Platform) that stayed down through the retries in DEV-10 §1.
// Distinct from a 500: the caller may succeed by trying again later.
export class ServiceUnavailableError extends AppError {
  constructor(message = "外部サービスに接続できません。時間をおいてやり直してください。") {
    super(message, 503, "SERVICE_UNAVAILABLE");
  }
}

export class ValidationError extends AppError {
  constructor(readonly errors: Record<string, string[] | undefined>) {
    super("入力内容を確認してください。", 422, "VALIDATION_FAILED");
  }
}

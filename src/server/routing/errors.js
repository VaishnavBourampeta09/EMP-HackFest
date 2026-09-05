export class RoutingError extends Error {
  constructor(message, { code = 'ROUTING_ERROR', status = 502, provider, cause, details } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'RoutingError';
    this.code = code;
    this.status = status;
    this.provider = provider;
    this.details = details;
  }
}

export class RoutingInputError extends RoutingError {
  constructor(message, details) {
    super(message, { code: 'INVALID_ROUTE_INPUT', status: 400, details });
    this.name = 'RoutingInputError';
  }
}

export class RoutingProviderError extends RoutingError {
  constructor(provider, message, { status = 502, cause, details } = {}) {
    super(message, {
      code: 'ROUTING_PROVIDER_ERROR',
      status,
      provider,
      cause,
      details
    });
    this.name = 'RoutingProviderError';
  }
}

export function publicRoutingError(error) {
  if (error instanceof RoutingError) {
    return {
      code: error.code,
      message: error.message,
      provider: error.provider,
      details: error.details
    };
  }

  return {
    code: 'ROUTING_ERROR',
    message: 'The route service could not complete this request.'
  };
}

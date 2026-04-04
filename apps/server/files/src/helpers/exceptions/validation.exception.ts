export class ValidationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationException';
  }
}

export class FileValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
    this.name = 'FileValidationException';
  }
}

export class PathValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
    this.name = 'PathValidationException';
  }
}

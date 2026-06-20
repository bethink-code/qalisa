/**
 * A wrapper for secret material that resists accidental disclosure. The value is
 * held in a private field; `toString`/`toJSON` return a redaction marker, so a
 * Secret can never be logged, serialized, or interpolated into a string by
 * accident. Call `.reveal()` deliberately at the point of use (e.g. a send).
 */
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return "[REDACTED]";
  }

  toJSON(): string {
    return "[REDACTED]";
  }
}

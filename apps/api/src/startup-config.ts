export class PortConfigurationError extends Error {
  constructor() {
    super('PORT должен быть целым десятичным числом от 1 до 65535.');
    this.name = 'PortConfigurationError';
  }
}

export function readPort(value: string | undefined): number {
  if (value === undefined) return 3000;
  const text = value.trim();
  if (!/^\d+$/.test(text)) throw new PortConfigurationError();
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new PortConfigurationError();
  return port;
}

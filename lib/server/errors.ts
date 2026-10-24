export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireConfig(name: string) {
  const value = process.env[name];
  if (!value)
    throw new AppError(
      503,
      `${name} is required. Configure it on the server to enable this feature.`,
    );
  return value;
}

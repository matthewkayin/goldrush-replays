// An error a route throws to answer with this status. buildApp's error
// handler sends any 4xx as `{ message }`.
export function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

// What the customer is told when the server refuses or can't finish deleting
// their account. `error` is what api/client.ts rejects with; `status` is only
// missing when no answer came back. In every other case the account still
// exists.
export function accountDeletionErrorMessage(error: { status?: number; errMessage?: string }): string {
  if (error.status === 403 && error.errMessage === 'invalid_password') {
    return "That password isn't correct.";
  }
  if (error.status === 503) {
    return "Your account wasn't deleted because the server couldn't finish. Nothing else has changed. Please try again in a few minutes.";
  }
  if (error.status != null) {
    return "Your account wasn't deleted. Please try again.";
  }
  // No answer: the deletion may have finished even though the reply was lost.
  return "We couldn't reach the server. Check your connection and try again. If your account was already deleted, you won't be able to log in.";
}

export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

// Redirect to login with a toast notification
export function redirectToLogin(toast?: (options: { title: string; description: string; variant: string }) => void) {
  if (toast) {
    toast({
      title: "Unauthorized",
      description: "You are logged out. Logging in again...",
      variant: "destructive",
    });
  }
  setTimeout(() => {
    // Break out of the Replit preview iframe: the Replit login page refuses to
    // be embedded, so navigate the top-level window instead.
    (window.top ?? window).location.href = "/api/login";
  }, 500);
}

export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

/**
 * Navigate to a Replit auth endpoint (`/api/login` or `/api/logout`).
 *
 * Inside the Replit preview iframe, both embedding replit.com AND top-level
 * navigation are blocked by the iframe sandbox — so a normal link just silently
 * does nothing. In that case we open the flow in a NEW TAB (which the sandbox
 * allows), where the OAuth flow runs at the top level and works. Outside an
 * iframe — the deployed app, or the app opened in its own browser tab — we
 * navigate normally in the same tab.
 */
export function goToAuth(path: string): void {
  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    // Accessing window.top threw (cross-origin) => we are framed.
    inIframe = true;
  }

  if (inIframe) {
    // NB: don't pass the "noopener" feature — it makes window.open always
    // return null, which would defeat the popup-blocked check below.
    const opened = window.open(path, "_blank");
    if (opened) {
      // Sever the opener reference ourselves (the target is our own endpoint,
      // so tabnabbing risk is nil, but this keeps the new tab fully detached).
      opened.opener = null;
    } else {
      // Popup blocked too — last-ditch attempt at top-level navigation.
      try {
        (window.top ?? window).location.href = path;
      } catch {
        window.location.href = path;
      }
    }
    return;
  }

  window.location.href = path;
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
    goToAuth("/api/login");
  }, 500);
}

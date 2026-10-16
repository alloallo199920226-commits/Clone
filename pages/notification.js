(() => {
  let dialog;
  let loading = false;
  async function showNotification() {
    if (loading || dialog?.open) return;
    if (dialog) {
      dialog.showModal();
      return;
    }
    loading = true;
    try {
      const response = await fetch("/notifications");
      if (!response.ok || response.redirected) throw new Error();
      const documentCopy = new DOMParser().parseFromString(await response.text(), "text/html");
      const card = documentCopy.querySelector("[data-notification-card]");
      if (!card) throw new Error();
      dialog = document.createElement("dialog");
      dialog.setAttribute("aria-labelledby", "notification-title");
      dialog.style.cssText = "border:0;padding:0;border-radius:16px;width:calc(100% - 40px);max-width:360px;max-height:85dvh;background:white;color:#222;box-shadow:0 12px 50px #0005";
      card.style.margin = "0 auto";
      card.querySelectorAll("a").forEach((link) => {
        link.style.cssText += ";display:inline-block;padding:8px;color:#b90016";
      });
      const close = card.querySelector("[data-notification-close]");
      close.style.cssText = "border:0;border-radius:8px;background:#111;color:#fff;padding:14px;width:100%;cursor:pointer";
      close.addEventListener("click", () => dialog.close());
      dialog.append(card);
      document.body.append(dialog);
      const style = document.createElement("style");
      style.textContent = "dialog::backdrop{background:rgba(0,0,0,.65)}";
      document.head.append(style);
      dialog.showModal();
      close.focus();
    } catch {
      const message = document.createElement("p");
      message.setAttribute("role", "status");
      message.textContent = "Notification indisponible. Consultez la rubrique Notifications de votre compte.";
      document.querySelector("main")?.prepend(message);
    } finally {
      loading = false;
    }
  }
  window.addEventListener("pageshow", showNotification);
})();

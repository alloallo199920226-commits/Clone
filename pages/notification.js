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
      dialog.className = "platform-notification-dialog";
      dialog.setAttribute("aria-labelledby", "notification-title");
      const close = card.querySelector("[data-notification-close]");
      close.setAttribute("aria-label", "Fermer la notification pour cette visite");
      close.addEventListener("click", () => dialog.close());
      dialog.append(card);
      document.body.append(dialog);
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
  document.querySelector("[data-notification-open]")?.addEventListener("click", showNotification);
  window.addEventListener("pageshow", showNotification);
})();

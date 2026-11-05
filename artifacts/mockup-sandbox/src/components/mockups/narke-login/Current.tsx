import { useEffect, useState } from "react";
import "./_group.css";

/** Exact existing HTML and CSS, with authentication/network side effects removed. */
export function Current() {
  const [document, setDocument] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/__mockup/extracted-login/current.html").then(response => response.text()),
      fetch("/__mockup/extracted-login/current.css").then(response => response.text()),
    ]).then(([html, css]) => {
      const extracted = html
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace('<link rel="stylesheet" href="/connexion/auth.css">', `<style>${css}</style>`)
        .replaceAll("/pages/assets/iveco-auth-logo.png", "/__mockup/images/iveco-auth-logo.png")
        .replace('href="/inscription"', 'href="#"')
        .replace("</body>", `<script>
          document.querySelector("form").addEventListener("submit", event => {
            event.preventDefault();
            document.querySelector(".demo-notice").textContent="Référence visuelle — aucune connexion envoyée.";
          });
          document.querySelector(".country-trigger").addEventListener("click", () => {
            document.querySelector("[data-country-label]").textContent="Togo (+228)";
            document.querySelector("[name=country]").value="+228";
          });
        </script></body>`);
      if (active) setDocument(extracted);
    });
    return () => { active = false; };
  }, []);
  return <iframe className="extracted-login-preview" title="Connexion actuelle — référence extraite" srcDoc={document} />;
}

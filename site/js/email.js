/**
 * email.js — show an email address without handing it to spam bots.
 *
 * The page contains the address only as "name [at] domain" and, in a
 * data-email attribute, reversed with "#" for "@" ("moc.elpmaxe#eman").
 * Bots that harvest addresses look for "name@domain" or "mailto:" in the
 * HTML and find neither. For visitors, the text becomes a link; the real
 * address is put together only when it is clicked, and never written into
 * the page.
 *
 *   <span data-email="moc.elpmaxe#eman">name [at] example.com</span>
 *
 * Without JavaScript the text simply stays as it is.
 */

export function setupEmail() {
  for (const node of document.querySelectorAll("[data-email]")) {
    const reversed = node.dataset.email;
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = node.textContent;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      location.href = `mailto:${[...reversed].reverse().join("").replace("#", "@")}`;
    });
    node.replaceWith(a);
  }
}

// ============================================================
//  signin.js — the sign-in window (and "Forgot your password?").
// ============================================================
import { h, openModal, toast } from "../ui.js";
import { signIn, sendPasswordReset, setNewPassword } from "../store.js";
import { explain } from "../supabase.js";

export function openSignIn() {
  const email = h("input", { type: "email", autocomplete: "email", required: true, class: "input" });
  const password = h("input", { type: "password", autocomplete: "current-password", required: true, class: "input" });
  const message = h("p", { class: "form-error", role: "alert" });
  const submit = h("button", { type: "submit", class: "btn btn-primary btn-wide" }, "Sign in");

  const form = h("form", { class: "stack", novalidate: true },
    h("div", { class: "modal-head" },
      h("div", {}, h("h2", { class: "modal-title" }, "Sign in"),
        h("p", { class: "muted small" }, "Only the collection's owner can sign in.")),
      h("button", { type: "button", class: "btn btn-icon", "aria-label": "Close", onClick: () => close() }, "✕")),
    h("label", { class: "field" }, "Email", email),
    h("label", { class: "field" }, "Password", password),
    message, submit,
    h("button", { type: "button", class: "link-button", onClick: forgot }, "Forgot your password?"),
    h("p", { class: "note" }, "Just looking? You don't need an account: close this window to browse the collection, binders and changelog."));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    message.textContent = "";
    if (!email.value || !password.value) { message.textContent = "Enter your email and password."; return; }
    submit.disabled = true; submit.textContent = "Signing in…";
    try { await signIn(email.value.trim(), password.value); close(); toast("Signed in"); }
    catch (err) { message.textContent = explain(err); }
    finally { submit.disabled = false; submit.textContent = "Sign in"; }
  });

  async function forgot() {
    message.textContent = "";
    if (!email.value) { message.textContent = "Type your email above first, then click this again."; return; }
    try { await sendPasswordReset(email.value.trim()); message.textContent = ""; toast("If that's your account, a reset link is on its way to your inbox."); }
    catch (err) { message.textContent = explain(err); }
  }

  const close = openModal(form, { label: "Sign in" });
}

/** Shown after you open the reset link from your email. */
export function openNewPassword() {
  const pw = h("input", { type: "password", autocomplete: "new-password", class: "input", minlength: 8 });
  const again = h("input", { type: "password", autocomplete: "new-password", class: "input" });
  const message = h("p", { class: "form-error", role: "alert" });
  const form = h("form", { class: "stack", novalidate: true },
    h("h2", { class: "modal-title" }, "Choose a new password"),
    h("label", { class: "field" }, "New password (at least 8 characters)", pw),
    h("label", { class: "field" }, "Type it again", again),
    message,
    h("button", { type: "submit", class: "btn btn-primary btn-wide" }, "Save password"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (pw.value.length < 8) { message.textContent = "Use at least 8 characters."; return; }
    if (pw.value !== again.value) { message.textContent = "The two passwords don't match."; return; }
    try { await setNewPassword(pw.value); close(); toast("Password changed — you're signed in."); }
    catch (err) { message.textContent = explain(err); }
  });
  const close = openModal(form, { label: "Choose a new password" });
}

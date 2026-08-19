// Client-side mirror of api/_auth.js's ADMIN_EMAIL check. This is ONLY used
// to decide whether to render the "Admin" sidebar link — it is NOT the
// actual access control (a hidden link is still just a string in the JS
// bundle anyone can read). The real gate is server-side: GET
// /api/columns?resource=admin_stats independently checks the logged-in
// user's email and 404s anyone else, so hiding the link here is a UX
// nicety on top of a real check, not a substitute for one.
const ADMIN_EMAIL = 'manjyot1537@gmail.com';

export function isAdminEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase() === ADMIN_EMAIL;
}

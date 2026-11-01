// The SPA calls /api on its own host. That host proxies to this service, so
// the cookie is first-party and Lax is enough on phones and laptops.
// SameSite=None is a cross-site cookie. Separate *.run.app hosts are
// different sites, and Safari drops those cookies.
export const accessTokenCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

export const MEMBER_ROLES = ['registered', 'premium'];

export function homeForRole(role) {
  if (MEMBER_ROLES.includes(role)) return '/dashboard';
  if (role === 'business') return '/business';
  return '/';
}

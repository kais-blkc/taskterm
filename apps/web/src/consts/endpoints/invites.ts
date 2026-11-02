export const INVITES_ENDPOINTS = {
  INVITES: '/invites',
  INVITE_ITEM: (id: number): string => `/invites/${id}`,
  INVITE_RESEND: (id: number): string => `/invites/${id}/resend`,
  INVITE_CHECK: '/invites/check',
};

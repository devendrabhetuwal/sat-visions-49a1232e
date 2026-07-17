import { createMiddleware } from '@tanstack/react-start';

// Simple passthrough middleware — replaces requireSupabaseAuth when
// we manage auth via localStorage instead of Supabase JWT.
export const requireAdminSession = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    return next({
      context: {
        userId: 'admin',
        isAdmin: true,
      },
    });
  },
);

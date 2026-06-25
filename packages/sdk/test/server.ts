import { setupServer } from 'msw/node';

// Shared mock server. Tests register per-case handlers with `server.use(...)`.
export const server = setupServer();

// Base URLs the test client is pointed at (mirror the production split).
export const API_BASE = 'https://api.test/api/v1';
export const WEB_BASE = 'https://api.test/web/api/v1';

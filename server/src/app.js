/**
 * Express app: CORS, JSON, auth middleware, API routes.
 * Tenant isolation: tenant_id is NEVER read from client; always from DB via auth.
 */
import express from 'express';
import cors from 'cors';
import { authMiddleware } from './middleware/auth.js';
import signupRoutes from './routes/signup.js';
import meRoutes from './routes/me.js';
import productRoutes from './routes/products.js';
import customerRoutes from './routes/customers.js';
import invoiceRoutes from './routes/invoices.js';
import reportRoutes from './routes/reports.js';

const app = express();

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

// Health (no auth)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Signup complete: requires valid JWT but creates tenant+user (once)
app.use('/api/signup', signupRoutes);

// All other API routes: require valid JWT + user row (tenant resolved)
app.use('/api/me', authMiddleware, meRoutes);
app.use('/api/products', authMiddleware, productRoutes);
app.use('/api/customers', authMiddleware, customerRoutes);
app.use('/api/invoices', authMiddleware, invoiceRoutes);
app.use('/api/reports', authMiddleware, reportRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

export default app;

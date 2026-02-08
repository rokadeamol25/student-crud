/**
 * Multi-tenant Billing API
 * Entry point: loads env, mounts Express app, starts server.
 */
import 'dotenv/config';
import app from './src/app.js';

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`Billing API listening on port ${PORT}`);
});

import express from 'express';
import healthRouter from './routes/health.js';
import matchRouter from './routes/matches.js';
import validateGameRouter from './routes/validate-game.js';

export const app = express();
app.use(express.json());
app.use('/health', healthRouter);
app.use('/api/matches', matchRouter);
app.use('/api/validate-game', validateGameRouter);

export default app;

import dotenv from 'dotenv';
dotenv.config();

import { app } from './app.js';
import logger from './logger.js';

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  logger.info({ port }, 'smile4money-backend started');
});

export default app;

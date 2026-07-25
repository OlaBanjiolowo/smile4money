import dotenv from 'dotenv';
dotenv.config();

import { app } from './app.js';

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`smile4money-backend listening on http://localhost:${port}`);
});

export default app;

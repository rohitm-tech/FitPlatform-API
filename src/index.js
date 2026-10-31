import { config } from './config/env.js';
import { connectDatabase } from './database/connectDatabase.js';
import app from './app.js';

const PORT = config.PORT;

connectDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`⚡️ FitPlatform API running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to connect to database:', error);
    process.exit(1);
  });

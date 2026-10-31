import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { config } from './config/env.js';
import apiRouter from './routes/index.js';
import { notFoundMiddleware } from './middlewares/notFoundMiddleware.js';
import { errorMiddleware } from './middlewares/errorMiddleware.js';

dotenv.config();

const app = express();

app.use(helmet());

const corsOptions = {
  origin: config.CORS_ORIGIN,
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '8mb', verify:(req,_res,buffer)=>{if(req.originalUrl.split('?')[0]==='/api/v1/payments/webhook')req.rawBody=Buffer.from(buffer);} }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

app.use('/api/v1', apiRouter);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'FitPlatform API is running',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;

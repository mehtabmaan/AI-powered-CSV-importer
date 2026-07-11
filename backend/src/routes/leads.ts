import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { leadController } from '../controllers/leadController.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  },
});

// Route for file upload
router.post('/extract-leads', upload.single('file'), (req, res, next) => {
  leadController.extractLeads(req, res, next);
});

// SSE progress stream route
router.get('/progress/:jobId', (req, res, next) => {
  leadController.getProgress(req, res, next);
});

export default router;

import express from 'express';
import { getRecommendations, optimizeRoute } from '../controllers/ai.controller.js';

const router = express.Router();

// Lấy danh sách tour gợi ý (Hybrid CF)
router.post('/recommend', getRecommendations);

// Tính toán lộ trình (TSP Heuristic)
router.post('/optimize-route', optimizeRoute);

export default router;

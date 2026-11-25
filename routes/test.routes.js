import express from "express";
import { checkConnect } from "../controllers/test.controller.js";
import { debugEndpointGuard } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/healtdb", debugEndpointGuard, checkConnect);
export default router;

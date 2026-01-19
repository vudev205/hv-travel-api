import express from "express";
import { checkConnect } from "../controllers/test.controller.js";

const router = express.Router();

router.get("/healtdb", checkConnect);
export default router;

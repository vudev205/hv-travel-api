import connectDB from "../config/db.js";
import mongoose from "mongoose";

export const checkConnect = async (req, res) =>{
    await connectDB();
    const state = mongoose.connection.readyState;
    const mapState = {
        0: "disconnected",
        1: "connected",
        2: "connecting",
        3: "disconecting",
    }
    res.json({
        success: true,
        status: mapState[state]
    })
};
import axios from 'axios';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

export const getRecommendations = async (req, res) => {
    try {
        const { customer_id, top_k } = req.body;
        
        if (!customer_id) {
            return res.status(400).json({ status: false, message: "Thiếu customer_id" });
        }

        const response = await axios.post(`${PYTHON_API_URL}/api/recommend`, {
            customer_id,
            top_k: top_k || 5
        });

        res.status(200).json({
            status: true,
            data: response.data
        });
    } catch (error) {
        console.error("AI Recommendation Error:", error.response?.data || error.message);
        res.status(500).json({
            status: false,
            message: "Lỗi khi gọi AI Service (Recommendation)",
            error: error.response?.data || error.message
        });
    }
};

export const optimizeRoute = async (req, res) => {
    try {
        const { start_poi_id, pois_to_visit, end_poi_id } = req.body;

        if (!start_poi_id || !pois_to_visit || !Array.isArray(pois_to_visit)) {
            return res.status(400).json({ status: false, message: "Thiếu dữ liệu: start_poi_id và mảng pois_to_visit" });
        }

        const response = await axios.post(`${PYTHON_API_URL}/api/optimize-route`, {
            start_poi_id,
            pois_to_visit,
            end_poi_id
        });

        res.status(200).json({
            status: true,
            data: response.data
        });
    } catch (error) {
        console.error("AI TSP Error:", error.response?.data || error.message);
        res.status(500).json({
            status: false,
            message: "Lỗi khi gọi AI Service (TSP Heuristic)",
            error: error.response?.data || error.message
        });
    }
};

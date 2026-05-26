import axios from "axios";

const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://127.0.0.1:8000";

export const getRecommendations = async (req, res) => {
  try {
    const { top_k } = req.body;
    const customer_id = String(req.customer?._id || "");

    if (!customer_id) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }

    const response = await axios.post(`${PYTHON_API_URL}/api/recommend`, {
      customer_id,
      top_k: top_k || 5,
    });

    res.status(200).json({
      status: true,
      data: response.data,
    });
  } catch (error) {
    const detail = error.response?.data || error.message || String(error);
    console.error("AI Recommendation Error:", detail);
    res.status(500).json({
      status: false,
      message: "Loi khi goi AI Service (Recommendation)",
      error: detail,
    });
  }
};

export const optimizeRoute = async (req, res) => {
  try {
    const { start_poi_id, pois_to_visit, end_poi_id } = req.body;

    if (!start_poi_id || !pois_to_visit || !Array.isArray(pois_to_visit)) {
      return res.status(400).json({
        status: false,
        message: "Thieu du lieu: start_poi_id va mang pois_to_visit",
      });
    }

    const response = await axios.post(`${PYTHON_API_URL}/api/optimize-route`, {
      start_poi_id,
      pois_to_visit,
      end_poi_id,
    });

    res.status(200).json({
      status: true,
      data: response.data,
    });
  } catch (error) {
    const detail = error.response?.data || error.message || String(error);
    console.error("AI TSP Error:", detail);
    res.status(500).json({
      status: false,
      message: "Loi khi goi AI Service (TSP Heuristic)",
      error: detail,
    });
  }
};

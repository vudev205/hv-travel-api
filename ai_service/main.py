from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Imports từ các module AI
from database import get_all_tours, get_customer_by_id, get_all_route_edges
from models import RecommendRequest, TSPRequest
from recommendation import calculate_hybrid_score
from tsp_heuristic import solve_tsp_heuristic

app = FastAPI(
    title="HV-Travel AI & ML Service",
    description="Microservice cho hệ thống Gợi ý Tour (Hybrid CF) và Tối ưu Lộ trình (TSP Heuristic)",
    version="1.0.0"
)

# Cấu hình CORS để Node.js hoặc App có thể gọi
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "HV-Travel AI Service is running!"}

@app.post("/api/recommend", tags=["Machine Learning"])
async def recommend_tours(req: RecommendRequest):
    """
    Gợi ý Tour cá nhân hóa cho Khách hàng sử dụng thuật toán Lai (Hybrid).
    - Đọc sở thích cá nhân từ DB
    - Dùng TF-IDF tính Cosine Similarity (Content-based)
    - Phân tích Ngân sách
    """
    # 1. Lấy dữ liệu Customer
    customer = await get_customer_by_id(req.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # 2. Lấy dữ liệu toàn bộ Tour đang Active
    all_tours = await get_all_tours()
    if not all_tours:
        return {"recommendations": []}

    # 3. Tính toán AI ML
    recommendations = calculate_hybrid_score(customer, all_tours, top_k=req.top_k)

    return {
        "customer": {
            "id": str(customer["_id"]),
            "favoriteThemes": customer.get("preferences", {}).get("favoriteThemes", []),
            "budget": customer.get("preferences", {}).get("preferredBudgetLevel", "Medium")
        },
        "recommendations": recommendations
    }


@app.post("/api/optimize-route", tags=["Artificial Intelligence"])
async def optimize_route(req: TSPRequest):
    """
    Giải bài toán Tối ưu hóa Lộ trình Du lịch (TSP) bằng Heuristic 
    tính đến rủi ro kẹt xe (Traffic Delay Multiplier).
    """
    # 1. Lấy ma trận cạnh (Graph Edges) từ DB
    all_edges = await get_all_route_edges()
    if not all_edges:
        raise HTTPException(status_code=500, detail="Database chưa được nạp RouteEdges")

    # 2. Tính toán lộ trình
    result = solve_tsp_heuristic(
        start_poi=req.start_poi_id,
        pois_to_visit=req.pois_to_visit,
        end_poi=req.end_poi_id,
        all_edges=all_edges
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@app.get("/api/pois", tags=["Demo Data"])
async def get_pois():
    """Lấy danh sách các địa điểm để vẽ lên bản đồ Demo"""
    from database import get_all_pois
    pois = await get_all_pois()
    # Chuyển đổi ObjectId thành string để trả về JSON
    for poi in pois:
        poi["_id"] = str(poi["_id"])
    return {"status": True, "data": pois}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

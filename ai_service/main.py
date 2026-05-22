from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Imports từ các module AI
from database import get_all_tours, get_customer_by_id, get_all_route_edges, get_recommendation_interactions
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

    # 3. Lấy dữ liệu tương tác và tính Hybrid Recommendation
    interactions = await get_recommendation_interactions()
    recommendations = calculate_hybrid_score(
        customer,
        all_tours,
        bookings=interactions["bookings"],
        favourites=interactions["favourites"],
        reviews=interactions["reviews"],
        top_k=req.top_k,
    )

    return {
        "customer": {
            "id": str(customer["_id"]),
            "favoriteThemes": customer.get("preferences", {}).get("favoriteThemes", []),
            "budget": customer.get("preferences", {}).get("preferredBudgetLevel", "Medium")
        },
        "recommendations": recommendations,
        "meta": {
            "activeTourCount": len(all_tours),
            "bookingCount": len(interactions["bookings"]),
            "favouriteCount": len(interactions["favourites"]),
            "reviewCount": len(interactions["reviews"]),
        },
    }


import math

def haversine_distance(coord1, coord2):
    """Tính khoảng cách đường chim bay (mét) giữa 2 tọa độ [lng, lat]"""
    R = 6371000  # Bán kính Trái đất
    lon1, lat1 = math.radians(coord1[0]), math.radians(coord1[1])
    lon2, lat2 = math.radians(coord2[0]), math.radians(coord2[1])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    return R * c

@app.post("/api/optimize-route", tags=["Artificial Intelligence"])
async def optimize_route(req: TSPRequest):
    """
    Giải bài toán Tối ưu hóa Lộ trình Du lịch (TSP) bằng Heuristic.
    """
    all_poi_ids = [req.start_poi_id] + req.pois_to_visit
    if req.end_poi_id:
        all_poi_ids.append(req.end_poi_id)
    all_poi_ids = list(set(all_poi_ids))

    from database import get_pois_by_ids, fetch_ors_matrix
    
    pois = await get_pois_by_ids(all_poi_ids)
    if len(pois) < 2:
        raise HTTPException(status_code=400, detail="Không tìm đủ POIs trong DB")

    poi_map = {str(p["_id"]): p for p in pois}
    locations = [p["location"]["coordinates"] for p in pois]
    poi_id_order = [str(p["_id"]) for p in pois]

    profile = req.vehicle_profile or "driving-car"
    try:
        matrix_data = await fetch_ors_matrix(locations, profile)
        distances = matrix_data["distances"]
        durations = matrix_data["durations"]
    except Exception as e:
        # Fallback toàn bộ sang chim bay nếu API chết
        distances = [[None for _ in pois] for _ in pois]
        durations = [[None for _ in pois] for _ in pois]

    fake_edges = []
    import random
    
    for i in range(len(pois)):
        for j in range(len(pois)):
            if i == j: continue
            
            dist = distances[i][j]
            dur = durations[i][j]
            is_fallback = False
            
            # --- FALLBACK CHIM BAY NẾU KHÔNG CÓ ĐƯỜNG LỘ ---
            if dist is None or dur is None:
                dist = haversine_distance(locations[i], locations[j])
                # Giả định vận tốc trung bình 30km/h cho các đoạn đường khó đi/chim bay
                dur = (dist / 1000) / 30 * 3600 
                is_fallback = True
            
            traffic_multiplier = 1.0
            if profile == "driving-car" and not is_fallback:
                if dist < 15000:
                    traffic_multiplier = random.uniform(1.3, 2.0)
                else:
                    traffic_multiplier = random.uniform(1.0, 1.2)

            fake_edges.append({
                "sourcePoiId": poi_id_order[i],
                "targetPoiId": poi_id_order[j],
                "sourceName": poi_map[poi_id_order[i]]["placeName"],
                "targetName": poi_map[poi_id_order[j]]["placeName"],
                "distanceMeters": dist,
                "baseDurationSeconds": dur,
                "trafficDelayMultiplier": traffic_multiplier,
            })

    result = solve_tsp_heuristic(
        start_poi=req.start_poi_id,
        pois_to_visit=req.pois_to_visit,
        end_poi=req.end_poi_id,
        all_edges=fake_edges
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    result["vehicle"] = profile
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

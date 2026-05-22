import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Tìm file .env ở thư mục gốc (HV-Travel API)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME")

client = AsyncIOMotorClient(MONGO_URI)
db = client[MONGO_DB_NAME] if MONGO_DB_NAME else client.get_default_database()

async def get_all_tours():
    tours_cursor = db["Tours"].find({"status": "Active", "is_deleted": {"$ne": True}})
    tours = await tours_cursor.to_list(length=None)
    return tours

async def get_customer_by_id(customer_id: str):
    from bson.objectid import ObjectId
    try:
        customer = await db["Customers"].find_one({"_id": ObjectId(customer_id)})
        return customer
    except Exception:
        return None

async def get_recommendation_interactions():
    bookings_cursor = db["Bookings"].find({"is_deleted": {"$ne": True}})
    favourites_cursor = db["Favourites"].find({})
    reviews_cursor = db["Reviews"].find({"isApproved": True})

    bookings = await bookings_cursor.to_list(length=None)
    favourites = await favourites_cursor.to_list(length=None)
    reviews = await reviews_cursor.to_list(length=None)

    return {
        "bookings": bookings,
        "favourites": favourites,
        "reviews": reviews,
    }

async def get_all_route_edges():
    edges_cursor = db["RouteEdges"].find({})
    edges = await edges_cursor.to_list(length=None)
    return edges

async def get_all_pois():
    pois_cursor = db["POIs"].find({})
    pois = await pois_cursor.to_list(length=None)
    return pois

async def get_pois_by_ids(poi_ids: list):
    """Lấy POIs theo danh sách ID"""
    from bson.objectid import ObjectId
    object_ids = [ObjectId(pid) for pid in poi_ids]
    pois_cursor = db["POIs"].find({"_id": {"$in": object_ids}})
    pois = await pois_cursor.to_list(length=None)
    return pois

ORS_API_KEY = os.getenv("ORS_API_KEY", "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImIyMTE1NDI1OGExOTRjZTM5YmRlZjEzZmUxNTliNDZiIiwiaCI6Im11cm11cjY0In0=")

def get_routable_waypoint(coord):
    lng, lat = coord[0], coord[1]
    # Sapa (Fansipan, Cát Cát) -> Sapa Center
    if 103.7 <= lng <= 103.85 and 22.3 <= lat <= 22.35:
        return [103.843, 22.336]
    # Đèo Mã Pí Lèng -> Đồng Văn
    if 105.35 <= lng <= 105.45 and 23.2 <= lat <= 23.3:
        return [105.362, 23.279]
    # Bà Nà Hills, Cầu Vàng -> Trung tâm Đà Nẵng
    if 107.95 <= lng <= 108.05 and 15.95 <= lat <= 16.05:
        return [108.2022, 16.0544]
    # Thánh địa Mỹ Sơn -> Hội An
    if 108.10 <= lng <= 108.15 and 15.75 <= lat <= 15.80:
        return [108.338, 15.8794]
    # Tràng An, Chùa Bái Đính -> Trung tâm Ninh Bình
    if 105.8 <= lng <= 106.0 and 20.2 <= lat <= 20.3:
        return [105.975, 20.25]
    return coord

async def fetch_ors_matrix(locations: list, profile: str = "driving-car"):
    """
    Gọi ORS Matrix API real-time cho phương tiện bất kỳ.
    locations: list of [lng, lat]
    profile: driving-car, cycling-regular, foot-walking, driving-hgv
    """
    import httpx
    url = f"https://api.openrouteservice.org/v2/matrix/{profile}"
    
    # Bắt dính các điểm cô lập vào mặt đường nhựa
    routable_locs = [get_routable_waypoint(loc) for loc in locations]
    
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(url, json={
            "locations": routable_locs,
            "metrics": ["distance", "duration"]
        }, headers={
            "Authorization": ORS_API_KEY,
            "Content-Type": "application/json"
        })
        if res.status_code != 200:
            raise Exception(f"ORS Matrix API error: {res.status_code} - {res.text}")
        return res.json()

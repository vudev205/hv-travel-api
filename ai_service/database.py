import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Tìm file .env ở thư mục gốc (HV-Travel API)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")

client = AsyncIOMotorClient(MONGO_URI)
db = client.get_default_database()

async def get_all_tours():
    tours_cursor = db["Tours"].find({"status": "Active"})
    tours = await tours_cursor.to_list(length=None)
    return tours

async def get_customer_by_id(customer_id: str):
    from bson.objectid import ObjectId
    try:
        customer = await db["Customers"].find_one({"_id": ObjectId(customer_id)})
        return customer
    except Exception:
        return None

async def get_all_route_edges():
    edges_cursor = db["RouteEdges"].find({})
    edges = await edges_cursor.to_list(length=None)
    return edges

async def get_all_pois():
    pois_cursor = db["POIs"].find({})
    pois = await pois_cursor.to_list(length=None)
    return pois

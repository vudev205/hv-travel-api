from pydantic import BaseModel
from typing import List, Optional

class RecommendRequest(BaseModel):
    customer_id: str
    top_k: int = 5

class POINode(BaseModel):
    poi_id: str
    place_name: str

class TSPRequest(BaseModel):
    start_poi_id: str
    pois_to_visit: List[str]  # Danh sách ID các địa điểm cần qua
    end_poi_id: Optional[str] = None # Nếu null, đi vòng về điểm xuất phát

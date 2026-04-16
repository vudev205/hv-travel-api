import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

def calculate_hybrid_score(customer, all_tours, top_k=5):
    """
    Thuật toán Gợi ý Lai (Hybrid Recommendation):
    1. Content-based: Match `customer.preferences.favoriteThemes` với `tour.tags`.
    2. Budget Match: Khớp ngân sách ưa thích.
    """
    if not all_tours:
        return []

    # 1. Trích xuất thuộc tính Tour
    tour_data = []
    for t in all_tours:
        tags = t.get("tags", [])
        # Chuyển mảng tags thành chuỗi cho TF-IDF
        tags_str = " ".join([str(tag).replace(" ", "_") for tag in tags])
        
        price_val = 0
        if t.get("price") and t["price"].get("adult"):
            if isinstance(t["price"]["adult"], dict) and "$numberDecimal" in t["price"]["adult"]:
                price_val = float(t["price"]["adult"]["$numberDecimal"])
            else:
                price_val = float(t["price"]["adult"])
                
        tour_data.append({
            "id": str(t["_id"]),
            "name": t.get("name", "Unknown"),
            "tags_str": tags_str,
            "raw_tags": tags,
            "price": price_val
        })

    df_tours = pd.DataFrame(tour_data)

    # 2. Vector hóa Tags bằng TF-IDF
    tfidf = TfidfVectorizer()
    # Thêm "Sở thích người dùng" như một văn bản (document) vào cuối danh sách để so sánh
    prefs = customer.get("preferences", {})
    fav_themes = prefs.get("favoriteThemes", [])
    user_tags_str = " ".join([str(tag).replace(" ", "_") for tag in fav_themes])
    
    # Text tổng hợp
    all_texts = df_tours["tags_str"].tolist()
    all_texts.append(user_tags_str)

    tfidf_matrix = tfidf.fit_transform(all_texts)
    
    # Tính Cosine Similarity giữa Vector của User (cuối cùng) với tất cả các Tour
    user_vector = tfidf_matrix[-1]
    tour_vectors = tfidf_matrix[:-1]
    cos_sim = cosine_similarity(user_vector, tour_vectors).flatten()

    # Lưu điểm số similarity vào DataFrame
    df_tours["content_score"] = cos_sim

    # 3. Collaborative / Heuristic Scoring (Xếp hạng Ngân sách & Lifestyle)
    budget = prefs.get("preferredBudgetLevel", "Medium")
    # Định nghĩa heuristic ngân sách
    def score_budget(price, pref_budget):
        if pref_budget == "Low" and price < 3000000: return 1.2
        if pref_budget == "Medium" and 3000000 <= price <= 8000000: return 1.2
        if pref_budget == "High" and price > 8000000: return 1.2
        return 1.0 # Bình thường

    df_tours["budget_multiplier"] = df_tours["price"].apply(lambda p: score_budget(p, budget))

    # Tổng điểm: Hybrid Score = Content Score * Budget Multiplier
    df_tours["hybrid_score"] = df_tours["content_score"] * df_tours["budget_multiplier"]

    # 4. Sắp xếp và lấy Top K
    top_tours = df_tours.sort_values(by="hybrid_score", ascending=False).head(top_k)
    
    result = []
    for _, row in top_tours.iterrows():
        result.append({
            "tour_id": row["id"],
            "name": row["name"],
            "match_score": round(row["hybrid_score"] * 100, 2), # % Match
            "matched_tags": list(set(row["raw_tags"]).intersection(set(fav_themes)))
        })

    return result

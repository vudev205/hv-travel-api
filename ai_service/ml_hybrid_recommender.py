from ml_basic_recommender import (
    as_list,
    build_user_item_matrix,
    calculate_collaborative_scores,
    calculate_content_scores,
    calculate_popularity_scores,
    get_tour_profile,
    normalize_budget,
    normalize_text,
    to_id,
)


DEFAULT_WEIGHTS = {
    "content": 0.45,
    "collaborative": 0.40,
    "popularity": 0.15,
}

COLD_START_WEIGHTS = {
    "content": 0.70,
    "collaborative": 0.0,
    "popularity": 0.30,
}

POPULAR_ONLY_WEIGHTS = {
    "content": 0.0,
    "collaborative": 0.0,
    "popularity": 1.0,
}


def get_weights(content_scores, collaborative_scores, target_interactions):
    has_content = any(score > 0 for score in content_scores.values())
    has_cf = bool(target_interactions) and any(score > 0 for score in collaborative_scores.values())
    if has_content and has_cf:
        return DEFAULT_WEIGHTS
    if has_content:
        return COLD_START_WEIGHTS
    return POPULAR_ONLY_WEIGHTS


def get_matched_tags(customer, profile):
    prefs = customer.get("preferences") or {}
    preferred_terms = {
        normalize_text(term)
        for term in [
            *as_list(prefs.get("favoriteThemes")),
            *as_list(prefs.get("preferredRegions")),
            normalize_budget(prefs.get("preferredBudgetLevel") or ""),
            prefs.get("travelStyle") or prefs.get("lifestyle") or "",
        ]
        if str(term).strip()
    }
    return [tag for tag in profile["tags"] if normalize_text(tag) in preferred_terms]


def build_reasons(profile, matched_tags, content_score, collaborative_score, popularity_score):
    reasons = []
    if matched_tags:
        reasons.append(f"Phù hợp sở thích: {', '.join(matched_tags[:3])}")
    elif content_score > 0:
        reasons.append("Nội dung tour gần với hồ sơ sở thích")
    if collaborative_score > 0:
        reasons.append("Tương tự các tour bạn đã quan tâm")
    if popularity_score >= 0.65:
        reasons.append("Tour đang được đánh giá và quan tâm cao")
    if profile.get("budget_level"):
        reasons.append(f"Ngân sách: {profile['budget_level']}")
    return reasons[:4]


def rank_candidates(customer, tour_profiles, target_interactions, content_scores, collaborative_scores, popularity_scores):
    weights = get_weights(content_scores, collaborative_scores, target_interactions)
    candidates = []

    for tour_id, profile in tour_profiles.items():
        if tour_id in target_interactions:
            continue

        content_score = content_scores.get(tour_id, 0.0)
        collaborative_score = collaborative_scores.get(tour_id, 0.0)
        popularity_score = popularity_scores.get(tour_id, 0.0)
        final_score = (
            weights["content"] * content_score
            + weights["collaborative"] * collaborative_score
            + weights["popularity"] * popularity_score
        )
        matched_tags = get_matched_tags(customer, profile)

        candidates.append(
            {
                "tour_id": tour_id,
                "name": profile["name"],
                "match_score": round(final_score * 100, 2),
                "content_score": round(content_score, 4),
                "collaborative_score": round(collaborative_score, 4),
                "popularity_score": round(popularity_score, 4),
                "matched_tags": matched_tags,
                "reason": build_reasons(profile, matched_tags, content_score, collaborative_score, popularity_score),
            }
        )

    candidates.sort(
        key=lambda item: (
            item["match_score"],
            item["collaborative_score"],
            item["content_score"],
            item["popularity_score"],
        ),
        reverse=True,
    )
    return candidates


def dedupe_by_tour_name(candidates, top_k):
    deduped = []
    seen_names = set()
    for item in candidates:
        name_key = normalize_text(item["name"]).strip()
        if name_key in seen_names:
            continue
        seen_names.add(name_key)
        deduped.append(item)
        if len(deduped) >= top_k:
            break
    return deduped


def calculate_hybrid_score(customer, all_tours, bookings=None, favourites=None, reviews=None, top_k=5):
    """
    Machine Learning layer:
    - Hybrid Recommendation cho đề tài Học máy cơ bản.
    - Kết hợp Content-based Filtering, Item-based Collaborative Filtering và Popularity.
    - Xử lý cold-start và xếp hạng tour theo điểm phù hợp.
    """
    if not all_tours:
        return []

    tour_profiles = {
        profile["id"]: profile
        for profile in (get_tour_profile(tour) for tour in all_tours)
        if profile["id"]
    }
    valid_tour_ids = set(tour_profiles.keys())
    target_user_id = to_id(customer.get("_id") or customer.get("id"))

    user_item, popularity = build_user_item_matrix(bookings, favourites, reviews, valid_tour_ids)
    collaborative_scores, target_interactions = calculate_collaborative_scores(target_user_id, user_item, valid_tour_ids)
    content_scores = calculate_content_scores(customer, tour_profiles, target_interactions)
    popularity_scores = calculate_popularity_scores(tour_profiles, popularity)
    candidates = rank_candidates(
        customer,
        tour_profiles,
        target_interactions,
        content_scores,
        collaborative_scores,
        popularity_scores,
    )

    return dedupe_by_tour_name(candidates, top_k)

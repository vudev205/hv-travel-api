from collections import defaultdict
from math import sqrt
import unicodedata

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def to_id(value):
    if value is None:
        return ""
    return str(value)


def as_float(value, default=0.0):
    try:
        if isinstance(value, dict) and "$numberDecimal" in value:
            return float(value["$numberDecimal"])
        if hasattr(value, "to_decimal"):
            return float(value.to_decimal())
        return float(value)
    except (TypeError, ValueError):
        return default


def as_list(value):
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value:
        return [str(value).strip()]
    return []


def normalize_text(value):
    text = str(value or "")
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return text.replace("đ", "d").replace("Đ", "D").lower()


def unique(values):
    seen = set()
    result = []
    for value in values:
        key = normalize_text(value).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(str(value).strip())
    return result


def get_price(tour):
    price = tour.get("price") or {}
    return as_float(price.get("adult"), 0.0)


def budget_level_from_price(price):
    if price <= 0:
        return ""
    if price < 3000000:
        return "Thấp"
    if price <= 8000000:
        return "Trung bình"
    return "Cao"


def normalize_budget(value):
    raw = normalize_text(value).strip()
    if raw in {"low", "thap", "tiet kiem", "binh dan"}:
        return "Thấp"
    if raw in {"medium", "trung binh", "pho thong", "vua phai"}:
        return "Trung bình"
    if raw in {"high", "cao", "cao cap", "sang trong", "luxury"}:
        return "Cao"
    return str(value or "").strip()


def build_schedule_text(schedule):
    pieces = []
    for item in schedule or []:
        pieces.extend(
            [
                item.get("title", ""),
                item.get("description", ""),
                " ".join(as_list(item.get("activities"))),
            ]
        )
    return " ".join(pieces)


def get_tour_profile(tour):
    destination = tour.get("destination") or {}
    duration = tour.get("duration") or {}
    price = get_price(tour)
    budget_level = tour.get("budget_level") or budget_level_from_price(price)
    tags = unique(
        [
            *as_list(tour.get("tags")),
            *as_list(tour.get("themes")),
            tour.get("travel_style", ""),
            budget_level,
            destination.get("city", ""),
            destination.get("region", ""),
            tour.get("category", ""),
        ]
    )
    text = " ".join(
        [
            tour.get("name", ""),
            tour.get("category", ""),
            destination.get("city", ""),
            destination.get("country", ""),
            destination.get("region", ""),
            tour.get("description", ""),
            duration.get("text", ""),
            build_schedule_text(tour.get("schedule")),
            " ".join(as_list(tour.get("inclusions"))),
            " ".join(as_list(tour.get("exclusions"))),
            " ".join(tags),
        ]
    )
    return {
        "id": to_id(tour.get("_id")),
        "name": tour.get("name", "Unknown"),
        "tags": tags,
        "budget_level": budget_level,
        "travel_style": tour.get("travel_style", ""),
        "price": price,
        "text": normalize_text(text),
        "rating": as_float(tour.get("rating"), 0.0),
        "review_count": as_float(tour.get("review_count") or tour.get("reviewCount"), 0.0),
        "raw": tour,
    }


def build_user_text(customer, target_interactions, tour_profiles):
    prefs = customer.get("preferences") or {}
    favorite_themes = as_list(prefs.get("favoriteThemes"))
    preferred_regions = as_list(prefs.get("preferredRegions"))
    budget = normalize_budget(prefs.get("preferredBudgetLevel") or "")
    travel_style = str(prefs.get("travelStyle") or prefs.get("lifestyle") or "").strip()

    pieces = [
        " ".join(favorite_themes),
        " ".join(preferred_regions),
        budget,
        travel_style,
        str(customer.get("segment") or ""),
        str((customer.get("address") or {}).get("city") or ""),
    ]

    for tour_id in target_interactions.keys():
        profile = tour_profiles.get(tour_id)
        if profile:
            pieces.append(profile["text"])

    return normalize_text(" ".join(pieces))


def calculate_content_scores(customer, tour_profiles, target_interactions):
    if not tour_profiles:
        return {}

    user_text = build_user_text(customer, target_interactions, tour_profiles)
    tour_ids = list(tour_profiles.keys())
    documents = [tour_profiles[tour_id]["text"] for tour_id in tour_ids]

    if not user_text and not any(documents):
        return {tour_id: 0.0 for tour_id in tour_ids}

    try:
        tfidf = TfidfVectorizer(token_pattern=r"(?u)\b\w+\b", ngram_range=(1, 2), min_df=1)
        matrix = tfidf.fit_transform([*documents, user_text or "du lich"])
        scores = cosine_similarity(matrix[-1], matrix[:-1]).flatten()
    except ValueError:
        return {tour_id: 0.0 for tour_id in tour_ids}

    return {tour_id: float(scores[index]) for index, tour_id in enumerate(tour_ids)}


def add_interaction(user_item, user_id, tour_id, score):
    if not user_id or not tour_id:
        return
    user_item[user_id][tour_id] += score


def build_user_item_matrix(bookings, favourites, reviews, valid_tour_ids):
    user_item = defaultdict(lambda: defaultdict(float))
    popularity = defaultdict(lambda: {"bookings": 0, "favourites": 0, "reviews": 0, "rating_sum": 0.0})

    for favourite in favourites or []:
        user_id = to_id(favourite.get("customerId") or favourite.get("customer_id"))
        tour_id = to_id(favourite.get("tourId") or favourite.get("tour_id"))
        if tour_id not in valid_tour_ids:
            continue
        add_interaction(user_item, user_id, tour_id, 3.0)
        popularity[tour_id]["favourites"] += 1

    for booking in bookings or []:
        user_id = to_id(booking.get("customer_id") or booking.get("customerId"))
        tour_id = to_id(booking.get("tour_id") or booking.get("tourId"))
        if tour_id not in valid_tour_ids:
            continue
        status = normalize_text(booking.get("status"))
        payment_status = normalize_text(booking.get("payment_status") or booking.get("paymentStatus"))
        score = 5.0 if status in {"confirmed", "paid", "completed"} or payment_status in {"paid", "full"} else 4.0
        if status == "cancelled":
            score = 1.0
        add_interaction(user_item, user_id, tour_id, score)
        popularity[tour_id]["bookings"] += 1

    for review in reviews or []:
        if review.get("isApproved") is False:
            continue
        user_id = to_id(review.get("customerId") or review.get("customer_id"))
        tour_id = to_id(review.get("tourId") or review.get("tour_id"))
        if tour_id not in valid_tour_ids:
            continue
        rating = max(1.0, min(5.0, as_float(review.get("rating"), 0.0)))
        add_interaction(user_item, user_id, tour_id, rating)
        popularity[tour_id]["reviews"] += 1
        popularity[tour_id]["rating_sum"] += rating

    return user_item, popularity


def cosine_dict(left, right):
    common = set(left.keys()).intersection(right.keys())
    numerator = sum(left[key] * right[key] for key in common)
    left_norm = sqrt(sum(value * value for value in left.values()))
    right_norm = sqrt(sum(value * value for value in right.values()))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return numerator / (left_norm * right_norm)


def build_item_vectors(user_item):
    item_vectors = defaultdict(dict)
    for user_id, tours in user_item.items():
        for tour_id, score in tours.items():
            item_vectors[tour_id][user_id] = score
    return item_vectors


def calculate_collaborative_scores(target_user_id, user_item, valid_tour_ids):
    target_interactions = dict(user_item.get(target_user_id, {}))
    if not target_interactions:
        return {tour_id: 0.0 for tour_id in valid_tour_ids}, target_interactions

    item_vectors = build_item_vectors(user_item)
    scores = {}

    for candidate_id in valid_tour_ids:
        if candidate_id in target_interactions:
            scores[candidate_id] = 0.0
            continue

        numerator = 0.0
        denominator = 0.0
        candidate_vector = item_vectors.get(candidate_id, {})
        for interacted_id, interaction_score in target_interactions.items():
            similarity = cosine_dict(candidate_vector, item_vectors.get(interacted_id, {}))
            if similarity <= 0:
                continue
            numerator += similarity * interaction_score
            denominator += interaction_score

        scores[candidate_id] = numerator / denominator if denominator > 0 else 0.0

    return scores, target_interactions


def calculate_popularity_scores(tour_profiles, popularity):
    max_bookings = max([stats["bookings"] for stats in popularity.values()] or [0])
    max_favourites = max([stats["favourites"] for stats in popularity.values()] or [0])
    max_reviews = max(
        [profile.get("review_count", 0.0) for profile in tour_profiles.values()]
        + [stats["reviews"] for stats in popularity.values()]
        or [0]
    )

    scores = {}
    for tour_id, profile in tour_profiles.items():
        stats = popularity.get(tour_id, {})
        rating_from_reviews = (
            stats.get("rating_sum", 0.0) / stats.get("reviews", 1)
            if stats.get("reviews", 0) > 0
            else profile["rating"]
        )
        rating_score = max(0.0, min(1.0, rating_from_reviews / 5.0))
        booking_score = stats.get("bookings", 0) / max_bookings if max_bookings else 0.0
        favourite_score = stats.get("favourites", 0) / max_favourites if max_favourites else 0.0
        review_count = max(stats.get("reviews", 0), profile.get("review_count", 0.0))
        review_score = review_count / max_reviews if max_reviews else 0.0

        scores[tour_id] = (
            0.50 * rating_score
            + 0.20 * booking_score
            + 0.20 * favourite_score
            + 0.10 * review_score
        )

    return scores

import networkx as nx
import itertools

def solve_tsp_heuristic(start_poi, pois_to_visit, end_poi, all_edges):
    """
    Sử dụng NetworkX và thuật toán để giải quyết TSP cơ bản.
    Hàm heuristic f(n) = base_duration * traffic_multiplier
    """
    # Xây dựng Graph từ MongoDB Edges
    G = nx.DiGraph()
    
    for edge in all_edges:
        source = str(edge["sourcePoiId"])
        target = str(edge["targetPoiId"])
        
        # Hàm chi phí f(n) = g(n) + h(n)
        # Trong đó g(n) là base_duration, 
        # h(n) có thể biến tấu bằng traffic_multiplier * khoảng_cách_đường_chim_bay (nếu có tọa độ).
        # Ở đây đơn giản hóa f(n) = thời gian lái xe thực tế có kẹt xe
        cost = float(edge.get("baseDurationSeconds", 0)) * float(edge.get("trafficDelayMultiplier", 1.0))
        
        G.add_edge(source, target, weight=cost, 
                   distance=edge.get("distanceMeters", 0),
                   base_time=edge.get("baseDurationSeconds", 0),
                   name_s=edge.get("sourceName", ""),
                   name_t=edge.get("targetName", ""))

    nodes_to_visit = set(pois_to_visit)
    if start_poi: nodes_to_visit.add(start_poi)
    if end_poi: nodes_to_visit.add(end_poi)
    
    nodes_list = list(nodes_to_visit)
    
    # Kiểm tra xem các node có nằm trong Graph không
    valid_nodes = [n for n in nodes_list if n in G.nodes()]
    if len(valid_nodes) < 2:
        return {"error": "Không đủ điểm hợp lệ để tính toán (hoặc chưa cập nhật DB Cạnh)."}

    # Vì số lượng POIs trong 1 tuor nhỏ (thường < 8 điểm), dùng Brute-force để đảm bảo tối ưu tuyệt đối
    # Nếu lớn hơn, sử dụng thuật toán xấp xỉ TSP của NetworkX
    
    best_cost = float('inf')
    best_path = []
    
    # Lấy các điểm trung gian (bỏ Start và End ra để hoán vị)
    intermediates = [n for n in valid_nodes if n != start_poi and n != end_poi]
    
    for perm in itertools.permutations(intermediates):
        route = []
        if start_poi in valid_nodes:
            route.append(start_poi)
            
        route.extend(list(perm))
        
        # Nếu end_poi không có, mặc định quay về start_poi (TSP kín)
        final_end = end_poi if end_poi in valid_nodes else start_poi
        if len(route) > 0:
            route.append(final_end)
            
        # Tính tổng chi phí cho route này
        current_cost = 0
        valid_route = True
        for i in range(len(route) - 1):
            u = route[i]
            v = route[i+1]
            if G.has_edge(u, v):
                current_cost += G[u][v]['weight']
            else:
                valid_route = False
                break
                
        if valid_route and current_cost < best_cost:
            best_cost = current_cost
            best_path = route

    if not best_path:
        return {"error": "Không tìm thấy đường đi khả thi nối các điểm này."}

    # Bóc tách thông tin chi tiết của Best Path
    path_details = []
    total_distance_m = 0
    total_time_s = 0
    
    for i in range(len(best_path) - 1):
        u = best_path[i]
        v = best_path[i+1]
        edge_data = G[u][v]
        
        total_distance_m += edge_data['distance']
        total_time_s += edge_data['weight'] # Time đã tính traffic
        
        path_details.append({
            "from": edge_data['name_s'],
            "to": edge_data['name_t'],
            "computed_time_minutes": round(edge_data['weight'] / 60, 1),
            "base_time_minutes": round(edge_data['base_time'] / 60, 1),
            "distance_km": round(edge_data['distance'] / 1000, 2)
        })

    return {
        "optimized_route_ids": best_path,
        "total_estimated_time_minutes": round(total_time_s / 60, 1),
        "total_distance_km": round(total_distance_m / 1000, 2),
        "path_details": path_details
    }

import httpx, asyncio
import sys

# Windows console fix for utf-8
sys.stdout.reconfigure(encoding='utf-8')

async def main():
    pois = {
        "Ninh Binh 1": [105.975, 20.25],
        "Ninh Binh 2": [105.978, 20.254]
    }
    hanoi = [105.8524, 21.034]
    
    async with httpx.AsyncClient() as c:
        for name, coord in pois.items():
            res = await c.post(
                'https://api.openrouteservice.org/v2/directions/driving-car/geojson', 
                json={'coordinates': [hanoi, coord]}, 
                headers={'Authorization': 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImIyMTE1NDI1OGExOTRjZTM5YmRlZjEzZmUxNTliNDZiIiwiaCI6Im11cm11cjY0In0='}
            )
            print(f"{name}: {res.status_code}")
            if res.status_code != 200:
                print(res.text[:200])

asyncio.run(main())

import httpx, asyncio
async def main():
    async with httpx.AsyncClient() as c:
        res = await c.post('https://api.openrouteservice.org/v2/directions/driving-car/geojson', json={'coordinates': [[107.5773, 16.4698], [107.02, 20.91]]}, headers={'Authorization': 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImIyMTE1NDI1OGExOTRjZTM5YmRlZjEzZmUxNTliNDZiIiwiaCI6Im11cm11cjY0In0='})
        print(res.status_code, res.text[:500])
asyncio.run(main())

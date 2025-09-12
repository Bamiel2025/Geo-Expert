from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
import requests
from dotenv import load_dotenv
import json
from shapely.geometry import shape, Point

load_dotenv()

# Gemini API key from environment
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

# --- Data Loading ---
CARTEAUBAGNE_FEATURES = []
NOTICE_DATA = {}
AGE_DATA = {}

def load_carteaubagne_data():
    global CARTEAUBAGNE_FEATURES
    try:
        with open("cartenettoyee2.geojson", "r", encoding="utf-8") as f:
            data = json.load(f)
            CARTEAUBAGNE_FEATURES = data["features"]
        print(f"Successfully loaded {len(CARTEAUBAGNE_FEATURES)} features from cartenettoyee2.geojson.")
    except Exception as e:
        print(f"CRITICAL ERROR loading cartenettoyee2.geojson: {e}")

def load_notice_data():
    global NOTICE_DATA
    try:
        with open("noticeexplicative.groovy", "r", encoding="utf-8") as f:
            NOTICE_DATA = json.load(f)
        print(f"Successfully loaded {len(NOTICE_DATA)} entries from noticeexplicative.groovy.")
    except Exception as e:
        print(f"ERROR loading noticeexplicative.groovy: {e}")

def load_age_data():
    global AGE_DATA
    try:
        with open("age.json", "r", encoding="utf-8") as f:
            AGE_DATA = json.load(f)
        print(f"Successfully loaded {len(AGE_DATA)} entries from age.json.")
    except Exception as e:
        print(f"ERROR loading age.json: {e}")

def find_feature_by_location(lon, lat):
    point = Point(lon, lat)
    matching_features = []
    for feature in CARTEAUBAGNE_FEATURES:
        geom = feature.get("geometry")
        if not geom:
            continue
        shapely_geom = shape(geom)
        if shapely_geom.contains(point):
            matching_features.append((shapely_geom.area, feature["properties"]))
    if not matching_features:
        return None
    matching_features.sort(key=lambda x: x[0])
    return matching_features[0][1]

# Load data at startup
load_carteaubagne_data()
load_notice_data()
load_age_data()

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class LocationSearch(BaseModel):
    query: str


class GeologyFeatureInfoQuery(BaseModel):
    bbox: str
    width: int
    height: int
    x: int
    y: int
    lat: float
    lon: float

# Routes
@app.post("/api/search-location")
async def search_location(location: LocationSearch):
    try:
        url = "https://nominatim.openstreetmap.org/search"
        headers = {"User-Agent": "GeoExplorer-France/1.0 (geological.application@example.com)"}
        params = {
            "q": location.query, "format": "json", "limit": 10, "countrycodes": "fr",
            "addressdetails": 1, "bounded": 1, "viewbox": "-5.5,41.3,10.0,51.1"
        }
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        results = response.json()
        formatted_results = [res for res in results if "France" in res.get("display_name", "")]
        return {"results": formatted_results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la recherche: {str(e)}")

@app.post("/api/geology-info")
async def get_geology_info(query: GeologyFeatureInfoQuery):
    detailed_info = find_feature_by_location(query.lon, query.lat)
    if not detailed_info:
        raise HTTPException(status_code=404, detail="Les coordonnées sont en dehors de la zone de la carte d'Aubagne.")

    notation = detailed_info.get('NOTATION')
    notice_info = NOTICE_DATA.get(notation, {})
    age_info = AGE_DATA.get(notation, {})
    age_display = notice_info.get('age_formation', 'Non disponible')
    if age_info:
        age_display += f" ({age_info.get('nom_periode', '')})"

    return {
        "coordinates": {"lat": query.lat, "lon": query.lon},
        "query_info": {"region": "Aubagne (carte locale)"},
        "geological_info": {
            "age": age_display,
            "lithology": notice_info.get('lithologie', detailed_info.get('DESCR', 'Non disponible')),
            "fossiles": notice_info.get('fossiles', 'Non disponible'),
            "description": f"Notation: {detailed_info.get('NOTATION', 'N/A')}",
            "description_generale": notice_info.get('description_generale', 'Non disponible')
        }
    }


@app.post("/api/chat-geology")
async def chat_geology(request: Request):
    print("--- CHAT GEOLOGY ENDPOINT HIT ---")
    try:
        if not GEMINI_API_KEY:
            print("--- ERROR: GEMINI_API_KEY not set in environment ---")
            raise HTTPException(status_code=500, detail="Clé API Gemini non configurée dans l'environnement.")

        body = await request.json()
        contents = body.get('contents')
        model = body.get('model', 'gemini-1.5-flash')  # default to old model if not provided
        print(f"--- MODEL REQUESTED: {model} ---")
        print(f"--- RECEIVED CONTENTS: {contents} ---")
        if not contents:
            print("--- ERROR: Invalid request content ---")
            raise HTTPException(status_code=400, detail="Contenu de la requête invalide.")

        print("--- CONFIGURING GOOGLE GENERATIVE AI ---")
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        print(f"--- CREATING MODEL: {model} ---")
        gemini_model = genai.GenerativeModel(model)
        print("--- GENERATING CONTENT ---")
        response = gemini_model.generate_content(contents)
        print("--- CONTENT GENERATED SUCCESSFULLY ---")

        formatted_response = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": response.text}
                        ]
                    }
                }
            ]
        }
        print(f"--- FORMATTED RESPONSE LENGTH: {len(response.text)} characters ---")
        print("--- SENDING RESPONSE ---")
        return formatted_response
    except Exception as e:
        print(f"--- ERROR IN CHAT_GEOLOGY: {str(e)} ---")
        import traceback
        print("--- FULL TRACEBACK ---")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Désolé, une erreur est survenue: {str(e)}")

@app.get("/api/wms-layers")
async def get_wms_layers():
    try:
        layers = {
            "geological_map_50k": {
                "name": "Carte géologique France 1/50 000",
                "url": "http://geoservices.brgm.fr/geologie",
                "layers": "SCAN_D_GEOL50",
                "format": "image/png",
                "transparent": True
            },
            "geological_map_250k": {
                "name": "Carte géologique France 1/250 000",
                "url": "http://geoservices.brgm.fr/geologie",
                "layers": "SCAN_F_GEOL250",
                "format": "image/png",
                "transparent": True
            },
            "geological_map_1m": {
                "name": "Carte géologique France 1/1 000 000",
                "url": "http://geoservices.brgm.fr/geologie",
                "layers": "SCAN_F_GEOL1M",
                "format": "image/png",
                "transparent": True
            }
        }
        return {"layers": layers}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur WMS: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

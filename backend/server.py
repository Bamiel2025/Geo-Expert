from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
import uuid
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from emergentintegrations.llm.chat import LlmChat, UserMessage
import asyncio
import json

load_dotenv()

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB setup
MONGO_URL = os.environ.get('MONGO_URL')
client = AsyncIOMotorClient(MONGO_URL)
db = client.geology_app

# Security
security = HTTPBearer()

# Models
class LocationSearch(BaseModel):
    query: str

class ChatMessage(BaseModel):
    message: str
    session_id: str
    openai_key: Optional[str] = None
    gemini_key: Optional[str] = None

class APIKeysConfig(BaseModel):
    openai_key: Optional[str] = None
    gemini_key: Optional[str] = None
    session_id: str

class GeologyQuery(BaseModel):
    lat: float
    lon: float
    zoom: int

# Routes
@app.get("/api/health")
async def health():
    return {"status": "healthy"}

@app.post("/api/search-location")
async def search_location(location: LocationSearch):
    """Search for French locations using Nominatim API"""
    try:
        # Search specifically in France
        url = "https://nominatim.openstreetmap.org/search"
        
        # Add User-Agent header as required by Nominatim
        headers = {
            "User-Agent": "GeoExplorer-France/1.0 (geological.application@example.com)"
        }
        
        params = {
            "q": location.query,
            "format": "json",
            "limit": 10,
            "countrycodes": "fr",
            "addressdetails": 1,
            "bounded": 1,
            "viewbox": "-5.5,41.3,10.0,51.1"  # France bounding box
        }
        
        response = requests.get(url, params=params, headers=headers, timeout=10)
        
        if response.status_code == 200:
            results = response.json()
            formatted_results = []
            
            for result in results:
                # Additional filtering for French locations
                display_name = result.get("display_name", "")
                if "France" in display_name or "France" in result.get("address", {}).get("country", ""):
                    formatted_results.append({
                        "display_name": display_name,
                        "lat": float(result.get("lat", 0)),
                        "lon": float(result.get("lon", 0)),
                        "type": result.get("type", ""),
                        "importance": result.get("importance", 0),
                        "address": result.get("address", {})
                    })
            
            # If no results, try a broader search
            if not formatted_results:
                params["q"] = f"{location.query} France"
                params.pop("bounded", None)
                params.pop("viewbox", None)
                
                response2 = requests.get(url, params=params, headers=headers, timeout=10)
                if response2.status_code == 200:
                    results2 = response2.json()
                    for result in results2:
                        display_name = result.get("display_name", "")
                        if "France" in display_name:
                            formatted_results.append({
                                "display_name": display_name,
                                "lat": float(result.get("lat", 0)),
                                "lon": float(result.get("lon", 0)),
                                "type": result.get("type", ""),
                                "importance": result.get("importance", 0),
                                "address": result.get("address", {})
                            })
            
            return {"results": formatted_results}
        else:
            print(f"Nominatim API error: {response.status_code} - {response.text}")
            return {"results": []}
            
    except requests.exceptions.Timeout:
        print("Nominatim API timeout")
        return {"results": [], "error": "Timeout lors de la recherche"}
    except Exception as e:
        print(f"Search error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la recherche: {str(e)}")

@app.post("/api/geology-info")
async def get_geology_info(query: GeologyQuery):
    """Get geological information for a specific point"""
    try:
        # This would integrate with BRGM services
        # For now, returning mock data structure
        geology_data = {
            "coordinates": {"lat": query.lat, "lon": query.lon},
            "geological_info": {
                "age": "Jurassique supérieur (Oxfordien-Kimméridgien)",
                "lithology": "Calcaires à Astartes, marnes à huîtres",
                "formation": "Formation des Calcaires de Beauce",
                "era": "Mésozoïque",
                "period": "Jurassique",
                "description": "Calcaires massifs avec intercalations marneuses, présence de fossiles marins",
                "tectonic_context": "Bordure du Bassin parisien",
                "mineral_resources": "Calcaire exploitable, nappe phréatique"
            },
            "risk_assessment": {
                "seismic_risk": "Faible",
                "geotechnical_risk": "Modéré - terrain karstique",
                "hydrogeological_context": "Aquifère calcaire"
            }
        }
        
        return geology_data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur géologique: {str(e)}")

@app.post("/api/save-api-keys")
async def save_api_keys(config: APIKeysConfig):
    """Save API keys configuration for a session"""
    try:
        # Store in database for the session
        await db.api_configs.update_one(
            {"session_id": config.session_id},
            {
                "$set": {
                    "session_id": config.session_id,
                    "openai_key": config.openai_key,
                    "gemini_key": config.gemini_key,
                    "updated_at": "2025-01-16"
                }
            },
            upsert=True
        )
        
        return {"status": "success", "message": "Clés API sauvegardées"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur sauvegarde: {str(e)}")

@app.get("/api/get-api-keys/{session_id}")
async def get_api_keys(session_id: str):
    """Get API keys for a session"""
    try:
        config = await db.api_configs.find_one({"session_id": session_id})
        
        if config:
            return {
                "openai_key": config.get("openai_key"),
                "gemini_key": config.get("gemini_key"),
                "configured": bool(config.get("openai_key")) and bool(config.get("gemini_key"))
            }
        else:
            return {"configured": False}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur récupération: {str(e)}")

@app.post("/api/chat-geology")
async def chat_geology(message: ChatMessage):
    """Chat with AI about geology"""
    try:
        # Get API keys for this session
        config = await db.api_configs.find_one({"session_id": message.session_id})
        
        if not config or not config.get("openai_key"):
            raise HTTPException(status_code=400, detail="Clés API non configurées")
        
        # Use OpenAI for geological explanations
        openai_key = config.get("openai_key")
        
        # Initialize chat with geological expertise
        system_message = """Vous êtes un expert géologue français spécialisé dans l'analyse des formations géologiques de France. 
        Vous maîtrisez parfaitement :
        - L'histoire géologique de la France
        - Les formations du BRGM au 1/50 000
        - La stratigraphie française
        - L'analyse des risques géotechniques
        - L'interprétation des cartes géologiques
        
        Répondez toujours en français avec une expertise technique précise, en expliquant l'évolution temporelle des formations et en proposant des comparaisons entre zones géologiques quand pertinent."""
        
        chat = LlmChat(
            api_key=openai_key,
            session_id=message.session_id,
            system_message=system_message
        ).with_model("openai", "gpt-4o")
        
        user_message = UserMessage(text=message.message)
        response = await chat.send_message(user_message)
        
        # Store chat history
        await db.chat_history.insert_one({
            "session_id": message.session_id,
            "user_message": message.message,
            "ai_response": response,
            "timestamp": "2025-01-16",
            "model_used": "gpt-4o"
        })
        
        return {"response": response, "model": "OpenAI GPT-4o"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur chat: {str(e)}")

@app.get("/api/wms-layers")
async def get_wms_layers():
    """Get available BRGM WMS layers"""
    try:
        # BRGM public WMS services
        layers = {
            "geological_map": {
                "name": "Carte géologique France 1/50 000",
                "url": "https://geoservices.brgm.fr/geologie",
                "layers": "GEOLOGIE_FRANCE_50K",
                "format": "image/png",
                "transparent": True
            },
            "geological_formations": {
                "name": "Formations géologiques",
                "url": "https://geoservices.brgm.fr/geologie",
                "layers": "FORMATIONS_GEOLOGIQUES",
                "format": "image/png",
                "transparent": True
            },
            "lithology": {
                "name": "Lithologie",
                "url": "https://geoservices.brgm.fr/geologie",
                "layers": "LITHOLOGIE_FRANCE",
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
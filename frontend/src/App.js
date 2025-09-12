import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Search, Layers, Info, X, Send, MapPin } from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from './components/ui/dialog';
import { Badge } from './components/ui/badge';
import './App.css';
import LlmConnector, { GeminiProvider } from '@rcb-plugins/llm-connector';
import ChatBot from 'react-chatbotify';

// OpenLayers imports
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import ImageLayer from 'ol/layer/Image';
import OSM from 'ol/source/OSM';
import ImageWMS from 'ol/source/ImageWMS';
import { fromLonLat, toLonLat } from 'ol/proj';
import { defaults as defaultControls } from 'ol/control';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

function App() {
  // State management
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [maps, setMaps] = useState({ satellite: null, geology: null });
  const [geologicalLayers, setGeologicalLayers] = useState({});
  const [activeLayers, setActiveLayers] = useState(['geological_map_1m', 'geological_map_50k']);
  const [sessionId] = useState(() => {
    let id = localStorage.getItem('sessionId');
    if (!id) {
      id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('sessionId', id);
    }
    return id;
  });
  
  
  // Geological info
  const [geologicalInfo, setGeologicalInfo] = useState(null);
  const [showGeologyPanel, setShowGeologyPanel] = useState(false);
  
  // Map refs
  const satelliteMapRef = useRef();
  const geologyMapRef = useRef();

  // Initialize maps and click handler
  useEffect(() => {
    const satelliteMap = new Map({
      target: satelliteMapRef.current,
      layers: [new TileLayer({ source: new OSM() })],
      view: new View({ center: fromLonLat([2.3488, 48.8534]), zoom: 6 }),
      controls: defaultControls({ attribution: false })
    });

    const geologyMap = new Map({
      target: geologyMapRef.current,
      layers: [new TileLayer({ source: new OSM() })],
      view: new View({ center: fromLonLat([2.3488, 48.8534]), zoom: 6 }),
      controls: defaultControls({ attribution: false })
    });

    const syncMaps = (sourceMap, targetMap) => {
      sourceMap.getView().on('change:center', () => {
        targetMap.getView().setCenter(sourceMap.getView().getCenter());
      });
      sourceMap.getView().on('change:zoom', () => {
        targetMap.getView().setZoom(sourceMap.getView().getZoom());
      });
    };

    syncMaps(satelliteMap, geologyMap);
    syncMaps(geologyMap, satelliteMap);

    geologyMap.on('singleclick', async (event) => {
      setShowGeologyPanel(false);
      setGeologicalInfo(null);
      const view = geologyMap.getView();
      const mapSize = geologyMap.getSize();
      const extent = view.calculateExtent(mapSize);
      const [lon, lat] = toLonLat(event.coordinate);
      const [x, y] = event.pixel;
      const payload = { 
        bbox: extent.join(','), width: mapSize[0], height: mapSize[1],
        x: Math.round(x), y: Math.round(y), lat, lon
      };
      try {
        const response = await axios.post(`${BACKEND_URL}/api/geology-info`, payload);
        setGeologicalInfo(response.data);
        setShowGeologyPanel(true);
      } catch (error) {
        const errorMessage = error.response?.data?.detail || 'Erreur lors de la récupération des données géologiques.';
        alert(errorMessage);
      }
    });

    setMaps({ satellite: satelliteMap, geology: geologyMap });

    return () => {
      satelliteMap.setTarget(null);
      geologyMap.setTarget(null);
    };
  }, []);

  useEffect(() => {
    const loadWMSLayers = async () => {
      try {
        const response = await axios.get(`${BACKEND_URL}/api/wms-layers`);
        setGeologicalLayers(response.data.layers);
      } catch (error) {
        console.error('Erreur chargement WMS:', error);
      }
    };
    loadWMSLayers();
  }, []);


  useEffect(() => {
    if (maps.geology && Object.keys(geologicalLayers).length > 0) {
      const layers = maps.geology.getLayers();
      const baseLayers = layers.getArray().slice(0, 1);
      layers.clear();
      baseLayers.forEach(layer => layers.push(layer));
      activeLayers.forEach(layerKey => {
        const layerConfig = geologicalLayers[layerKey];
        if (layerConfig) {
          maps.geology.addLayer(new ImageLayer({
            source: new ImageWMS({
              url: layerConfig.url,
              params: { 'LAYERS': layerConfig.layers, 'FORMAT': layerConfig.format, 'TRANSPARENT': layerConfig.transparent },
              serverType: 'geoserver'
            }),
            opacity: 0.8
          }));
        }
      });
    }
  }, [maps.geology, geologicalLayers, activeLayers]);

  const toggleLayer = (layerKey) => {
    setActiveLayers(prev => prev.includes(layerKey) ? prev.filter(key => key !== layerKey) : [...prev, layerKey]);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      const response = await axios.post(`${BACKEND_URL}/api/search-location`, { query: searchQuery });
      setSearchResults(response.data.results);
    } catch (error) {
      console.error('Erreur recherche:', error);
    }
  };

  const selectLocation = (location) => {
    setSelectedLocation(location);
    setSearchResults([]);
    setSearchQuery(location.display_name);
    const coordinate = fromLonLat([location.lon, location.lat]);
    if (maps.satellite && maps.geology) {
      maps.satellite.getView().setCenter(coordinate);
      maps.satellite.getView().setZoom(12);
      maps.geology.getView().setCenter(coordinate);
      maps.geology.getView().setZoom(12);
    }
  };


  const plugins = [LlmConnector()];

  const flow = {
    start: {
      message: "Bonjour! Je suis l\'assistant géologique. Posez-moi une question.",
      path: "user-input",
    },
    'user-input': {
      user: true,
      path: "handle-message",
    },
    'handle-message': {
      llmConnector: {
        provider: new GeminiProvider({
          mode: 'direct',
          model: 'gemini-2.5-flash',
          apiKey: process.env.REACT_APP_GEMINI_API_KEY || 'your_gemini_api_key_here',
          systemMessage: 'You are a helpful geology assistant. You can access web search to answer questions. All your responses must be in French.'
        }),
      },
      path: "user-input",
    },
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-content">
          <div className="search-container">
            <form onSubmit={handleSearch} className="flex items-center w-full">
              <Button type="submit" className="search-btn mr-2"><Search size={16} /></Button>
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher une localisation..."
                className="w-full"
              />
            </form>
            {searchResults.length > 0 && (
              <div className="location-results">
                {searchResults.map((location, index) => (
                  <div key={index} className="location-result" onClick={() => selectLocation(location)}>
                    <MapPin size={14} className="mr-2" />
                    {location.display_name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>


      <main className="main-content">
        <div className="maps-container">
          <div className="map-panel">
            <div className="map-header"><h3>Carte Satellite</h3><Badge variant="outline">OpenStreetMap</Badge></div>
            <div ref={satelliteMapRef} className="map-view" />
          </div>
          <div className="map-panel">
            <div className="map-header">
              <h3>Carte Géologique</h3>
              <Badge variant="outline">BRGM</Badge>
              <div className="layer-controls">
                <Dialog>
                  <DialogTrigger asChild><Button variant="outline" size="sm"><Layers size={16} />Couches</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Couches géologiques</DialogTitle><DialogDescription>Sélectionnez les couches.</DialogDescription></DialogHeader>
                    <div className="layer-list">
                      {Object.entries(geologicalLayers).map(([key, layer]) => (
                        <div key={key} className="layer-item">
                          <input type="checkbox" checked={activeLayers.includes(key)} onChange={() => toggleLayer(key)} />
                          <label>{layer.name}</label>
                        </div>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <div ref={geologyMapRef} className="map-view" />
            <div className="map-instructions"><Info size={14} /><span>Cliquez pour informations géologiques</span></div>
          </div>
        </div>

        {showGeologyPanel && geologicalInfo && (
          <div className="side-panel geology-panel">
            <div className="panel-header"><h3>Informations Géologiques</h3><Button variant="ghost" size="sm" onClick={() => setShowGeologyPanel(false)}><X size={16} /></Button></div>
            <div className="geology-content">
              <Card>
                <CardHeader><CardTitle>Données Géologiques</CardTitle></CardHeader>
                <CardContent>
                  <div className="geology-info">
                    <div className="info-group"><h4>Âge</h4><p>{geologicalInfo?.geological_info?.age}</p></div>
                    <div className="info-group"><h4>Lithologie</h4><p>{geologicalInfo?.geological_info?.lithology}</p></div>
                    <div className="info-group"><h4>Fossiles</h4><p>{geologicalInfo?.geological_info?.fossiles}</p></div>
                    <div className="info-group"><h4>Description</h4><p>{geologicalInfo?.geological_info?.description}</p></div>
                    <div className="info-group"><h4>Description générale</h4><p>{geologicalInfo?.geological_info?.description_generale}</p></div>
                  </div>
                </CardContent>
              </Card>
              <div className="chatbot-container" style={{ height: '400px', marginTop: '20px' }}>
                <ChatBot
                  plugins={plugins}
                  flow={flow}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

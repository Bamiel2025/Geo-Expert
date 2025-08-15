import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Search, Settings, MessageCircle, MapPin, Layers, Info, X, Send } from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './components/ui/dialog';
import { Textarea } from './components/ui/textarea';
import { Badge } from './components/ui/badge';
import './App.css';

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
  const [activeLayers, setActiveLayers] = useState(['geological_map_50k']);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  
  // API Configuration
  const [apiKeys, setApiKeys] = useState({ openai_key: '', gemini_key: '' });
  const [apiConfigured, setApiConfigured] = useState(false);
  const [showApiDialog, setShowApiDialog] = useState(false);
  
  // Chat system
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  
  // Geological info
  const [geologicalInfo, setGeologicalInfo] = useState(null);
  const [showGeologyPanel, setShowGeologyPanel] = useState(false);
  
  // Map refs
  const satelliteMapRef = useRef();
  const geologyMapRef = useRef();

  // Initialize maps
  useEffect(() => {
    // Satellite map (left)
    const satelliteMap = new Map({
      target: satelliteMapRef.current,
      layers: [
        new TileLayer({
          source: new OSM()
        })
      ],
      view: new View({
        center: fromLonLat([2.3488, 48.8534]), // Paris
        zoom: 6
      }),
      controls: defaultControls({ attribution: false })
    });

    // Geology map (right)  
    const geologyMap = new Map({
      target: geologyMapRef.current,
      layers: [
        new TileLayer({
          source: new OSM()
        })
      ],
      view: new View({
        center: fromLonLat([2.3488, 48.8534]), // Paris
        zoom: 6
      }),
      controls: defaultControls({ attribution: false })
    });

    // Synchronize map views
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

    // Add click interaction for geological info on geology map
    geologyMap.on('singleclick', async (event) => {
      console.log('Clic détecté sur la carte géologique');
      const coordinate = event.coordinate;
      const [lon, lat] = toLonLat(coordinate);
      
      console.log(`Coordonnées: lat=${lat}, lon=${lon}`);
      
      try {
        console.log('Envoi de la requête API...');
        const response = await axios.post(`${BACKEND_URL}/api/geology-info`, {
          lat,
          lon,
          zoom: geologyMap.getView().getZoom()
        });
        
        console.log('Réponse API reçue:', response.data);
        setGeologicalInfo(response.data);
        setShowGeologyPanel(true);
        console.log('Panel géologique ouvert');
      } catch (error) {
        console.error('Erreur info géologique:', error);
        // Afficher une notification d'erreur à l'utilisateur
        alert('Erreur lors de la récupération des données géologiques');
      }
    });

    setMaps({ satellite: satelliteMap, geology: geologyMap });

    // Cleanup
    return () => {
      satelliteMap.setTarget(null);
      geologyMap.setTarget(null);
    };
  }, []);

  // Load WMS layers
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

  // Add geological layers to map
  useEffect(() => {
    if (maps.geology && Object.keys(geologicalLayers).length > 0) {
      // Clear existing layers except base map
      const layers = maps.geology.getLayers();
      const baseLayers = layers.getArray().slice(0, 1); // Keep OSM base layer
      layers.clear();
      baseLayers.forEach(layer => layers.push(layer));

      // Add active geological layers
      activeLayers.forEach(layerKey => {
        const layerConfig = geologicalLayers[layerKey];
        if (layerConfig) {
          const wmsLayer = new ImageLayer({
            source: new ImageWMS({
              url: layerConfig.url,
              params: {
                'LAYERS': layerConfig.layers,
                'FORMAT': layerConfig.format,
                'TRANSPARENT': layerConfig.transparent
              },
              serverType: 'geoserver'
            }),
            opacity: 0.8
          });
          
          maps.geology.addLayer(wmsLayer);
        }
      });
    }
  }, [maps.geology, geologicalLayers, activeLayers]);

  // Check API configuration
  useEffect(() => {
    const checkApiConfig = async () => {
      try {
        const response = await axios.get(`${BACKEND_URL}/api/get-api-keys/${sessionId}`);
        setApiConfigured(response.data.configured);
        if (response.data.configured) {
          setApiKeys({
            openai_key: response.data.openai_key || '',
            gemini_key: response.data.gemini_key || ''
          });
        }
      } catch (error) {
        console.error('Erreur vérification API:', error);
      }
    };

    checkApiConfig();
  }, [sessionId]);

  // Search locations
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      const response = await axios.post(`${BACKEND_URL}/api/search-location`, {
        query: searchQuery
      });
      
      setSearchResults(response.data.results);
    } catch (error) {
      console.error('Erreur recherche:', error);
    }
  };

  // Select location
  const selectLocation = (location) => {
    setSelectedLocation(location);
    setSearchResults([]);
    setSearchQuery(location.display_name);

    // Update both maps
    const coordinate = fromLonLat([location.lon, location.lat]);
    if (maps.satellite && maps.geology) {
      maps.satellite.getView().setCenter(coordinate);
      maps.satellite.getView().setZoom(12);
      maps.geology.getView().setCenter(coordinate);
      maps.geology.getView().setZoom(12);
    }
  };

  // Save API keys
  const saveApiKeys = async () => {
    try {
      await axios.post(`${BACKEND_URL}/api/save-api-keys`, {
        session_id: sessionId,
        openai_key: apiKeys.openai_key,
        gemini_key: apiKeys.gemini_key
      });
      
      setApiConfigured(true);
      setShowApiDialog(false);
    } catch (error) {
      console.error('Erreur sauvegarde API:', error);
    }
  };

  // Send chat message
  const sendChatMessage = async () => {
    if (!chatInput.trim() || !apiConfigured) return;

    const userMessage = chatInput;
    setChatInput('');
    setChatLoading(true);

    // Add user message to chat
    setChatMessages(prev => [...prev, { type: 'user', content: userMessage }]);

    try {
      const response = await axios.post(`${BACKEND_URL}/api/chat-geology`, {
        message: userMessage,
        session_id: sessionId
      });

      // Add AI response to chat
      setChatMessages(prev => [...prev, { 
        type: 'ai', 
        content: response.data.response,
        model: response.data.model 
      }]);
    } catch (error) {
      console.error('Erreur chat:', error);
      setChatMessages(prev => [...prev, { 
        type: 'error', 
        content: 'Erreur lors de la communication avec l\'IA. Vérifiez vos clés API.' 
      }]);
    }

    setChatLoading(false);
  };

  // Toggle layer
  const toggleLayer = (layerKey) => {
    setActiveLayers(prev => 
      prev.includes(layerKey) 
        ? prev.filter(key => key !== layerKey)
        : [...prev, layerKey]
    );
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo">
            <MapPin className="logo-icon" />
            <h1>GéoExplorer France</h1>
            <Badge variant="secondary">BRGM 1/50 000</Badge>
          </div>
          
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="search-container">
            <div className="search-input-wrapper">
              <Search className="search-icon" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher une localité française..."
                className="search-input"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
              />
              <Button type="submit" size="sm">
                Rechercher
              </Button>
            </div>
            
            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((result, index) => (
                  <div
                    key={index}
                    className="search-result-item"
                    onClick={() => selectLocation(result)}
                  >
                    <MapPin size={16} />
                    <span>{result.display_name}</span>
                  </div>
                ))}
              </div>
            )}
          </form>

          {/* Header Actions */}
          <div className="header-actions">
            <Dialog open={showApiDialog} onOpenChange={setShowApiDialog}>
              <DialogTrigger asChild>
                <Button variant={apiConfigured ? "secondary" : "destructive"} size="sm">
                  <Settings size={16} />
                  API Config
                </Button>
              </DialogTrigger>
              <DialogContent className="api-config-dialog">
                <DialogHeader>
                  <DialogTitle>Configuration des clés API</DialogTitle>
                </DialogHeader>
                <div className="api-config-content">
                  <div className="api-key-field">
                    <label>Clé OpenAI GPT :</label>
                    <Input
                      type="password"
                      value={apiKeys.openai_key}
                      onChange={(e) => setApiKeys(prev => ({...prev, openai_key: e.target.value}))}
                      placeholder="sk-..."
                    />
                  </div>
                  <div className="api-key-field">
                    <label>Clé Google Gemini :</label>
                    <Input
                      type="password"
                      value={apiKeys.gemini_key}
                      onChange={(e) => setApiKeys(prev => ({...prev, gemini_key: e.target.value}))}
                      placeholder="AIza..."
                    />
                  </div>
                  <Button onClick={saveApiKeys} className="save-api-btn">
                    Sauvegarder les clés
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Button 
              variant={showChat ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowChat(!showChat)}
              disabled={!apiConfigured}
            >
              <MessageCircle size={16} />
              Chat IA
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Maps Container */}
        <div className="maps-container">
          {/* Satellite Map */}
          <div className="map-panel">
            <div className="map-header">
              <h3>Carte Satellite</h3>
              <Badge variant="outline">OpenStreetMap</Badge>
            </div>
            <div ref={satelliteMapRef} className="map-view" />
          </div>

          {/* Geology Map */}
          <div className="map-panel">
            <div className="map-header">
              <h3>Carte Géologique</h3>
              <Badge variant="outline">BRGM 1/50 000</Badge>
              
              {/* Layer Controls */}
              <div className="layer-controls">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Layers size={16} />
                      Couches
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Couches géologiques</DialogTitle>
                    </DialogHeader>
                    <div className="layer-list">
                      {Object.entries(geologicalLayers).map(([key, layer]) => (
                        <div key={key} className="layer-item">
                          <input
                            type="checkbox"
                            checked={activeLayers.includes(key)}
                            onChange={() => toggleLayer(key)}
                          />
                          <label>{layer.name}</label>
                        </div>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <div ref={geologyMapRef} className="map-view" />
            <div className="map-instructions">
              <Info size={14} />
              <span>Cliquez sur la carte pour obtenir des informations géologiques</span>
            </div>
          </div>
        </div>

        {/* Side Panels */}
        {showChat && (
          <div className="side-panel chat-panel">
            <div className="panel-header">
              <h3>Assistant Géologue IA</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowChat(false)}>
                <X size={16} />
              </Button>
            </div>
            
            <div className="chat-messages">
              {chatMessages.map((msg, index) => (
                <div key={index} className={`chat-message ${msg.type}`}>
                  <div className="message-content">
                    {msg.content}
                    {msg.model && <div className="message-model">{msg.model}</div>}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="chat-message ai">
                  <div className="message-content loading">Analyse en cours...</div>
                </div>
              )}
            </div>
            
            <div className="chat-input-container">
              <Textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Posez votre question géologique..."
                className="chat-input"
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendChatMessage())}
              />
              <Button onClick={sendChatMessage} disabled={!chatInput.trim() || chatLoading}>
                <Send size={16} />
              </Button>
            </div>
          </div>
        )}

        {showGeologyPanel && geologicalInfo && (
          <div className="side-panel geology-panel">
            <div className="panel-header">
              <h3>Informations Géologiques</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowGeologyPanel(false)}>
                <X size={16} />
              </Button>
            </div>
            
            <div className="geology-content">
              <Card>
                <CardHeader>
                  <CardTitle>Données Géologiques</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="geology-info">
                    <div className="info-group">
                      <h4>Âge géologique</h4>
                      <p>{geologicalInfo.geological_info.age}</p>
                    </div>
                    
                    <div className="info-group">
                      <h4>Lithologie</h4>
                      <p>{geologicalInfo.geological_info.lithology}</p>
                    </div>
                    
                    <div className="info-group">
                      <h4>Formation</h4>
                      <p>{geologicalInfo.geological_info.formation}</p>
                    </div>
                    
                    <div className="info-group">
                      <h4>Description</h4>
                      <p>{geologicalInfo.geological_info.description}</p>
                    </div>
                    
                    <div className="info-group">
                      <h4>Contexte tectonique</h4>
                      <p>{geologicalInfo.geological_info.tectonic_context}</p>
                    </div>
                    
                    <div className="info-group">
                      <h4>Évaluation des risques</h4>
                      <p><strong>Sismique:</strong> {geologicalInfo.risk_assessment.seismic_risk}</p>
                      <p><strong>Géotechnique:</strong> {geologicalInfo.risk_assessment.geotechnical_risk}</p>
                      <p><strong>Hydrogéologique:</strong> {geologicalInfo.risk_assessment.hydrogeological_context}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;